// Strømmende ZIP-skriver til eksporten (server/export.js). Ingenting
// mellomlagres på disk: data-filene komprimeres i minnet, og filene fra
// biblioteket lagres ukomprimert (bilder og video er komprimert fra før).
// CRC regnes ut i en første runde over hver fil, så størrelse og CRC står i
// hodet foran dataene – det kan alle ZIP-programmer lese. ZIP64 brukes
// automatisk når arkivet passerer 4 GB.

import { open } from 'node:fs/promises';
import { promisify } from 'node:util';
import { crc32, deflateRaw } from 'node:zlib';

const deflate = promisify(deflateRaw);
const CHUNK = 1 << 20;
const MAX32 = 0xffffffff;
const UTF8_NAMES = 0x0800;
const MADE_BY = (3 << 8) | 45; // Unix, ZIP 4.5

/** Dato og klokkeslett i DOS-format (norsk tid, som filene vises med). */
function dosTime(when) {
  const d = when instanceof Date && !Number.isNaN(when.getTime()) ? when : new Date();
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, Number(x.value)])
  );
  return {
    time: (p.hour << 11) | (p.minute << 5) | Math.floor(p.second / 2),
    date: ((Math.max(1980, p.year) - 1980) << 9) | (p.month << 5) | p.day
  };
}

function localHeader(e) {
  const b = Buffer.alloc(30);
  b.writeUInt32LE(0x04034b50, 0);
  b.writeUInt16LE(20, 4);
  b.writeUInt16LE(UTF8_NAMES, 6);
  b.writeUInt16LE(e.method, 8);
  b.writeUInt16LE(e.time, 10);
  b.writeUInt16LE(e.date, 12);
  b.writeUInt32LE(e.crc, 14);
  b.writeUInt32LE(e.csize, 18);
  b.writeUInt32LE(e.size, 22);
  b.writeUInt16LE(e.name.length, 26);
  b.writeUInt16LE(0, 28);
  return Buffer.concat([b, e.name]);
}

function centralHeader(e) {
  // Bare plasseringen kan bli for stor (hver fil er under 4 GB).
  const zip64 = e.offset >= MAX32;
  const extra = Buffer.alloc(zip64 ? 12 : 0);
  if (zip64) {
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(8, 2);
    extra.writeBigUInt64LE(BigInt(e.offset), 4);
  }
  const b = Buffer.alloc(46);
  b.writeUInt32LE(0x02014b50, 0);
  b.writeUInt16LE(MADE_BY, 4);
  b.writeUInt16LE(zip64 ? 45 : 20, 6);
  b.writeUInt16LE(UTF8_NAMES, 8);
  b.writeUInt16LE(e.method, 10);
  b.writeUInt16LE(e.time, 12);
  b.writeUInt16LE(e.date, 14);
  b.writeUInt32LE(e.crc, 16);
  b.writeUInt32LE(e.csize, 20);
  b.writeUInt32LE(e.size, 24);
  b.writeUInt16LE(e.name.length, 28);
  b.writeUInt16LE(extra.length, 30);
  b.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
  b.writeUInt32LE(Math.min(e.offset, MAX32), 42);
  return Buffer.concat([b, e.name, extra]);
}

function endRecords(count, cdSize, cdOffset) {
  const out = [];
  if (count >= 0xffff || cdSize >= MAX32 || cdOffset >= MAX32) {
    const r = Buffer.alloc(56);
    r.writeUInt32LE(0x06064b50, 0);
    r.writeBigUInt64LE(44n, 4);
    r.writeUInt16LE(MADE_BY, 12);
    r.writeUInt16LE(45, 14);
    r.writeBigUInt64LE(BigInt(count), 24);
    r.writeBigUInt64LE(BigInt(count), 32);
    r.writeBigUInt64LE(BigInt(cdSize), 40);
    r.writeBigUInt64LE(BigInt(cdOffset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
    locator.writeUInt32LE(1, 16);
    out.push(r, locator);
  }
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(Math.min(count, 0xffff), 8);
  e.writeUInt16LE(Math.min(count, 0xffff), 10);
  e.writeUInt32LE(Math.min(cdSize, MAX32), 12);
  e.writeUInt32LE(Math.min(cdOffset, MAX32), 16);
  out.push(e);
  return out;
}

/**
 * Lager et ZIP-arkiv av `entries`: en (asynkron) liste med
 * { name, data, date? } (tekst eller Buffer) eller { name, file, date? } (sti
 * på disk). Filer som mangler, hoppes over. Gir Buffer-biter – bruk
 * ReadableStream.from(zip(…)) som svar. Avbryter klienten, lukkes alt.
 */
export async function* zip(entries) {
  const central = [];
  let offset = 0;
  for await (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const stamp = dosTime(entry.date);
    if (entry.data != null) {
      const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
      const packed = await deflate(raw);
      const method = packed.length < raw.length ? 8 : 0;
      const body = method ? packed : raw;
      const e = { name, ...stamp, method, crc: crc32(raw), size: raw.length, csize: body.length, offset };
      const head = localHeader(e);
      yield head;
      yield body;
      offset += head.length + body.length;
      central.push(e);
      continue;
    }

    // Samme åpne fil i begge rundene, så den ikke kan forsvinne underveis.
    const fh = await open(entry.file).catch(() => null);
    if (!fh) continue;
    try {
      const { size } = await fh.stat();
      if (size >= MAX32) continue;
      let crc = 0;
      const buf = Buffer.allocUnsafe(CHUNK);
      for (let pos = 0; pos < size; ) {
        const { bytesRead } = await fh.read(buf, 0, Math.min(CHUNK, size - pos), pos);
        if (!bytesRead) throw new Error(`${entry.name} ble kortere under eksporten`);
        crc = crc32(buf.subarray(0, bytesRead), crc);
        pos += bytesRead;
      }
      const e = { name, ...stamp, method: 0, crc, size, csize: size, offset };
      const head = localHeader(e);
      yield head;
      for (let pos = 0; pos < size; ) {
        const chunk = Buffer.allocUnsafe(Math.min(CHUNK, size - pos));
        const { bytesRead } = await fh.read(chunk, 0, chunk.length, pos);
        if (!bytesRead) throw new Error(`${entry.name} ble kortere under eksporten`);
        yield chunk.subarray(0, bytesRead);
        pos += bytesRead;
      }
      offset += head.length + size;
      central.push(e);
    } finally {
      await fh.close();
    }
  }

  let cdSize = 0;
  for (const e of central) {
    const h = centralHeader(e);
    cdSize += h.length;
    yield h;
  }
  yield* endRecords(central.length, cdSize, offset);
}
