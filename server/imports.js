// Import av dokumenter (PDF, PowerPoint, Word, Excel …) som lysbilder.
//
//   POST /api/import?playlist_id=1&name=Foiler.pptx&duration=10   (kropp = fila)
//     -> 202 { job }   Konverteringen kjører i bakgrunnen (kan ta lenger tid
//                      enn Cloudflare tillater for én forespørsel).
//   GET  /api/import?job=<id>
//     -> { status: running|done|error, done, total, slide_ids, error }
//
// Hver side blir en mediefil (i en mappe med dokumentets navn) og et lysbilde
// med sida i fullskjerm, lagt til sist i spillelisten.

import { randomUUID } from 'node:crypto';
import { documentKind, officeToPdf, pdfToPngs } from './convert.js';
import { checkLimit } from '../src/api/_shared.js';

const MAX_BYTES = 100 * 1024 * 1024;
const jobs = new Map(); // id -> jobb

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

// Rydd ferdige jobber etter en time.
setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [id, j] of jobs) if (j.finishedAt && j.finishedAt < cutoff) jobs.delete(id);
}, 600_000).unref();

const baseName = (name) => String(name).replace(/\.[^.]+$/, '').trim().slice(0, 80) || 'Dokument';

async function runJob(job, env, { playlistId, name, kind, buffer, duration }) {
  try {
    job.phase = kind === 'office' ? 'converting' : 'rendering';
    const pdf = kind === 'office' ? await officeToPdf(buffer, name) : buffer;
    job.phase = 'rendering';

    const pages = await pdfToPngs(pdf, {
      onPage: (i, total) => {
        job.done = i;
        job.total = total;
      }
    });

    job.phase = 'saving';
    const title = baseName(name);
    const maxRow = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM deck_slides WHERE playlist_id = ?')
      .bind(playlistId)
      .first();
    let position = (maxRow?.m ?? -1) + 1;

    for (let i = 0; i < pages.length; i++) {
      const key = `media/${randomUUID()}`;
      const put = await env.MEDIA.put(key, pages[i], { httpMetadata: { contentType: 'image/png' } });
      const media = await env.DB.prepare(
        'INSERT INTO media (name, folder, r2_key, content_type, size) VALUES (?, ?, ?, ?, ?) RETURNING id'
      )
        .bind(`${title} – side ${i + 1}.png`, title, key, 'image/png', put.size)
        .first();

      const slide = await env.DB.prepare(
        `INSERT INTO deck_slides (playlist_id, position, name, duration_seconds, transition, background)
         VALUES (?, ?, ?, ?, 'fade', '{"type":"color","color":"#000000"}') RETURNING id`
      )
        .bind(playlistId, position++, pages.length > 1 ? `${title} ${i + 1}/${pages.length}` : title, duration)
        .first();
      await env.DB.prepare(
        `INSERT INTO deck_elements (slide_id, z, kind, x, y, w, h, config) VALUES (?, 0, 'image', 0, 0, 100, 100, ?)`
      )
        .bind(slide.id, JSON.stringify({ url: `/api/media?id=${media.id}&raw=1`, fit: 'contain', radius: 0 }))
        .run();
      job.slide_ids.push(slide.id);
    }
    job.status = 'done';
  } catch (err) {
    console.error('[import]', err);
    job.status = 'error';
    job.error = err?.message || 'Ukjent feil';
  } finally {
    job.finishedAt = Date.now();
  }
}

/** Ruter /api/import på kundens subdomene. `env` er kundens env. */
export async function handleImportRoute(request, { tenant, user }, env) {
  if (!user) return json({ error: 'Ikke innlogget' }, 401);
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const job = jobs.get(url.searchParams.get('job') || '');
    if (!job || job.tenant !== tenant.slug) return json({ error: 'Ukjent jobb' }, 404);
    const { status, phase, done, total, slide_ids, error } = job;
    return json({ status, phase, done, total, slide_ids, error });
  }

  if (request.method !== 'POST') return json({ error: 'Metode ikke tillatt' }, 405);

  const playlistId = Number.parseInt(url.searchParams.get('playlist_id'), 10);
  const name = String(url.searchParams.get('name') || 'dokument').slice(0, 200);
  const duration = Math.min(600, Math.max(2, Number.parseInt(url.searchParams.get('duration'), 10) || 10));
  const kind = documentKind(name, request.headers.get('content-type') || '');

  if (!playlistId) return json({ error: 'playlist_id er påkrevd' }, 400);
  if (!kind) return json({ error: 'Støttede formater: PDF, PowerPoint, Keynote, Word og Excel.' }, 415);
  if (Number(request.headers.get('content-length')) > MAX_BYTES) {
    return json({ error: 'Fila er for stor (maks 100 MB).' }, 413);
  }
  const playlist = await env.DB.prepare('SELECT id FROM playlists WHERE id = ?').bind(playlistId).first();
  if (!playlist) return json({ error: 'Spillelisten finnes ikke' }, 404);

  // Sidene blir PNG-er; regn grovt med 3x dokumentets størrelse.
  const full = await checkLimit(env, 'storage', (Number(request.headers.get('content-length')) || 0) * 3);
  if (full) return full;

  const buffer = Buffer.from(await request.arrayBuffer());
  if (!buffer.length) return json({ error: 'Tom fil' }, 400);
  if (buffer.length > MAX_BYTES) return json({ error: 'Fila er for stor (maks 100 MB).' }, 413);

  const id = randomUUID();
  const job = { tenant: tenant.slug, status: 'running', phase: 'queued', done: 0, total: 0, slide_ids: [], error: null };
  jobs.set(id, job);
  runJob(job, env, { playlistId, name, kind, buffer, duration });
  return json({ job: id }, 202);
}
