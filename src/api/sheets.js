// Regneark (Flatr-appen «Regneark»): tall og lister fra Google Sheets, CSV-lenker
// og Excel-filer på nett, hentet på nytt hvert femte minutt (TTL i apps.js).
//
// Lenkene kunden limer inn gjøres om til en adresse med selve dataene:
//   Google Sheets (delt med «alle med lenken») -> /export?format=csv&gid=…
//   Google Sheets «Publiser på nettet»           -> /pub?output=csv
//   OneDrive «Bygg inn»                          -> /download (xlsx)
//   SharePoint                                   -> &download=1
// Excel-filer (.xlsx) pakkes ut her (zip + XML), uten egne biblioteker.

import { fetchBytes } from './safeFetch.js';

export const MAX_SHEETS = 10;
const MAX_ROWS = 500;
const MAX_COLS = 30;
const MAX_FILE = 8 * 1024 * 1024;

/** Adressen dataene hentes fra, ut fra lenken kunden limte inn. */
export function sourceUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new Error('Ugyldig lenke');
  }
  if (url.hostname === 'docs.google.com' && url.pathname.startsWith('/spreadsheets/')) {
    const gid = /gid=(\d+)/.exec(url.hash + url.search)?.[1];
    const pub = /^\/spreadsheets\/d\/e\/([\w-]+)/.exec(url.pathname);
    if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`;
    const id = /^\/spreadsheets\/d\/([\w-]+)/.exec(url.pathname)?.[1];
    if (id) return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
  }
  if (url.hostname === 'onedrive.live.com' && url.pathname.startsWith('/embed')) {
    url.pathname = '/download';
    return url.toString();
  }
  if (/\.sharepoint\.com$/i.test(url.hostname) && !url.searchParams.has('download')) {
    url.searchParams.set('download', '1');
    return url.toString();
  }
  return url.toString();
}

/* ---------------------------------- CSV ---------------------------------- */

/** CSV med komma, semikolon eller tabulator (det som er mest brukt i første linje). */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const sep = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (rows.length >= MAX_ROWS) break;
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/* --------------------------------- Excel --------------------------------- */

/** Filene i en zip (bare de vi trenger): navn -> innhold som tekst. */
async function unzip(bytes, wanted) {
  const { inflateRawSync } = await import('node:zlib');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Fila er ikke et gyldig Excel-ark');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count && view.getUint32(p, true) === 0x02014b50; n++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    out[name] = dec.decode(method === 8 ? inflateRawSync(data) : data);
  }
  return out;
}

const xmlText = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
const number = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 });

/** Første ark i en .xlsx-fil som rader med tekst. */
export async function parseXlsx(bytes) {
  const files = await unzip(bytes, (n) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(n));
  const strings = [...(files['xl/sharedStrings.xml'] || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
  );
  // Første ark i arbeidsboka (rekkefølgen kunden ser), via relasjonene.
  const rid = /<sheet\b[^>]*r:id="([^"]+)"/.exec(files['xl/workbook.xml'] || '')?.[1];
  const target = rid && new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`).exec(files['xl/_rels/workbook.xml.rels'] || '');
  const sheetPath = target ? `xl/${(target[1] || target[2]).replace(/^\/?xl\//, '')}` : 'xl/worksheets/sheet1.xml';
  const xml = files[sheetPath] || files['xl/worksheets/sheet1.xml'];
  if (!xml) throw new Error('Fant ikke noe ark i fila');
  const rows = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+\d+)"/.exec(c[1])?.[1];
      const type = /t="(\w+)"/.exec(c[1])?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] || '')?.[1];
      let value = '';
      if (type === 's') value = strings[Number(v)] ?? '';
      else if (type === 'inlineStr') value = xmlText([...(c[2] || '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      else if (type === 'b') value = v === '1' ? 'Ja' : 'Nei';
      else if (v != null) value = type === 'str' || Number.isNaN(Number(v)) ? xmlText(v) : number.format(Number(v));
      const i = ref ? colIndex(ref) : row.length;
      if (i < MAX_COLS) row[i] = value;
    }
    rows.push(Array.from(row, (x) => x ?? ''));
    if (rows.length >= MAX_ROWS) break;
  }
  return rows;
}

/* --------------------------------- data ---------------------------------- */

/** Radene i et regneark (lenken kunden limte inn). */
export async function readSheet(link) {
  const { bytes } = await fetchBytes(sourceUrl(link), { accept: 'text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*', maxBytes: MAX_FILE });
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const text = isZip ? '' : new TextDecoder().decode(bytes);
  if (!isZip && /^\s*<(!doctype|html)/i.test(text)) {
    throw new Error('Lenken går til en nettside, ikke til dataene. Del regnearket med «alle med lenken» (Google) eller bruk «Bygg inn» (OneDrive).');
  }
  const rows = (isZip ? await parseXlsx(bytes) : parseCsv(text))
    .map((r) => r.slice(0, MAX_COLS).map((x) => String(x ?? '').trim().slice(0, 300)))
    .filter((r) => r.some(Boolean));
  if (!rows.length) throw new Error('Regnearket er tomt');
  return rows;
}

/** Rydder appens innstillinger: { sheets: [{ id, name, url }] }. Nye lenker hentes én gang for å sjekke dem. */
export async function cleanSheetsConfig(input, prev = {}) {
  const known = new Map((prev.sheets || []).map((s) => [s.id, s]));
  const sheets = [];
  for (const s of (Array.isArray(input?.sheets) ? input.sheets : []).slice(0, MAX_SHEETS)) {
    const url = String(s?.url || '').trim();
    if (!url) continue;
    const old = s.id && known.get(s.id);
    if (!old || old.url !== url) await readSheet(url); // kaster med forklaring hvis lenken ikke virker
    sheets.push({
      id: old?.id || s.id || Math.random().toString(36).slice(2, 10),
      name: String(s.name || '').trim().slice(0, 60) || `Regneark ${sheets.length + 1}`,
      url: url.slice(0, 1000)
    });
  }
  return { sheets };
}

// Siste rader som ble hentet per lenke: vises videre hvis kilden er nede en stund.
const lastGood = new Map();

/** Data til skjermene: { sheets: { id: { name, rows, error? } } }. */
export async function sheetsData(config) {
  const out = {};
  await Promise.all(
    (config?.sheets || []).map(async (s) => {
      try {
        const rows = await readSheet(s.url);
        lastGood.set(s.url, rows);
        if (lastGood.size > 500) lastGood.delete(lastGood.keys().next().value);
        out[s.id] = { name: s.name, rows };
      } catch (err) {
        out[s.id] = { name: s.name, rows: lastGood.get(s.url) || [], error: err.message };
      }
    })
  );
  return { sheets: out, fetched_at: new Date().toISOString() };
}
