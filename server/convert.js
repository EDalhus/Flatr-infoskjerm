// Konvertering av dokumenter og nettsider til bilder.
//
//   Office (PPT/PPTX, DOC/DOCX, XLS/XLSX, ODP …) -> PDF   Gotenberg (LibreOffice)
//   PDF -> PNG pr. side                                  pdftoppm (poppler-utils)
//   Nettside -> skjermbilde                              Gotenberg (Chromium)
//
// Gotenberg kjører som egen container (se docker-compose.yml), CONVERTER_URL.

import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CONVERTER = () => process.env.CONVERTER_URL || 'http://converter:3000';

export const OFFICE_EXT = ['ppt', 'pptx', 'pps', 'ppsx', 'odp', 'key', 'doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods'];
export const MAX_PAGES = 200;

const extOf = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

export function documentKind(name, contentType = '') {
  const ext = extOf(name);
  if (ext === 'pdf' || contentType === 'application/pdf') return 'pdf';
  if (OFFICE_EXT.includes(ext)) return 'office';
  return null;
}

async function gotenberg(route, form, timeoutMs = 180_000) {
  const res = await fetch(`${CONVERTER()}${route}`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Konvertering feilet (${res.status}) ${text.slice(0, 200)}`.trim());
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Office-dokument -> PDF. */
export async function officeToPdf(buffer, filename) {
  const form = new FormData();
  form.append('files', new Blob([buffer]), filename);
  return gotenberg('/forms/libreoffice/convert', form);
}

/** PDF -> én PNG pr. side, lengste side `maxSide` px. Kaller onPage(i, total). */
export async function pdfToPngs(pdf, { maxSide = 1920, onPage } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'flatr-pdf-'));
  try {
    const input = path.join(dir, 'in.pdf');
    await writeFile(input, pdf);

    const info = await run('pdfinfo', [input]).catch(() => ({ stdout: '' }));
    const pages = Number((/Pages:\s+(\d+)/.exec(info.stdout) || [])[1]) || 0;
    if (pages > MAX_PAGES) throw new Error(`Dokumentet har ${pages} sider – maks ${MAX_PAGES}.`);

    // Én side om gangen, så vi kan melde fremdrift.
    const out = [];
    const total = pages || 1;
    for (let i = 1; i <= total; i++) {
      await run('pdftoppm', ['-png', '-r', '150', '-scale-to', String(maxSide), '-f', String(i), '-l', String(i), input, path.join(dir, 'p')], {
        timeout: 60_000
      });
      const file = (await readdir(dir)).find((f) => f.startsWith('p') && f.endsWith('.png'));
      if (!file) break;
      out.push(await readFile(path.join(dir, file)));
      await rm(path.join(dir, file));
      onPage?.(i, total);
    }
    if (!out.length) throw new Error('Fant ingen sider i dokumentet.');
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Skjermbilde av en nettside (JPEG). */
export async function screenshotUrl(url, { width = 1600, height = 900, waitSeconds = 2 } = {}) {
  const form = new FormData();
  form.append('url', url);
  form.append('width', String(width));
  form.append('height', String(height));
  form.append('format', 'jpeg');
  form.append('quality', '85');
  form.append('clip', 'true');
  form.append('waitDelay', `${waitSeconds}s`);
  return gotenberg('/forms/chromium/screenshot/url', form, 60_000);
}
