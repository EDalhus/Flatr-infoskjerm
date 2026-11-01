// Helsesjekk til statussiden (status.flatr.no, se status/). Svarer bare ja/nei
// per del – aldri adresser, versjoner eller feilmeldinger, siden den er åpen.
//
//   GET /api/health          -> { ok, time }
//   GET /api/health?deep=1   -> + checks: { database, storage, email, converter }
//                               (null = ikke i bruk på denne serveren)

import { statfs } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { platformDb, tenantResources } from './platform.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
// Det må være plass til nye opplastinger og nattens sikkerhetskopi.
const MIN_FREE_BYTES = 2 * 1024 ** 3;
const MIN_FREE_SHARE = 0.05;

let cached = null; // { at, checks } – statussiden spør hvert minutt, andre kan spørre oftere

async function databaseOk() {
  try {
    platformDb.prepare('SELECT 1').firstSync();
    // Én kundedatabase også, slik skjermene bruker dem.
    const t = platformDb.prepare('SELECT slug FROM tenants ORDER BY id LIMIT 1').firstSync();
    if (t) await tenantResources(t.slug).DB.prepare('SELECT 1').first();
    return true;
  } catch {
    return false;
  }
}

async function storageOk() {
  try {
    const s = await statfs(DATA_DIR);
    const free = s.bavail * s.bsize;
    return free > MIN_FREE_BYTES && free / (s.blocks * s.bsize) > MIN_FREE_SHARE;
  } catch {
    return false;
  }
}

function tcpOk(host, port, ms = 2000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(ms, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function converterOk() {
  try {
    const res = await fetch(`${process.env.CONVERTER_URL || 'http://converter:3000'}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function healthChecks() {
  if (cached && Date.now() - cached.at < 30_000) return cached.checks;
  const [database, storage, email, converter] = await Promise.all([
    databaseOk(),
    storageOk(),
    process.env.SMTP_HOST ? tcpOk(process.env.SMTP_HOST, Number(process.env.SMTP_PORT || 587)) : null,
    // Uten konverter (lokalt) er import av dokumenter ikke i bruk.
    process.env.CONVERTER_URL ? converterOk() : null
  ]);
  const checks = { database, storage, email, converter };
  cached = { at: Date.now(), checks };
  return checks;
}
