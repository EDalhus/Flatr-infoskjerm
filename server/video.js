// Mindre videofiler: videoer som lastes opp, komprimeres i bakgrunnen til et
// format alle skjermer spiller jevnt – H.264 (yuv420p), maks 1920 px på den
// lengste siden, maks 30 bilder i sekundet, AAC-lyd og «faststart» (kan starte
// før hele fila er lastet). Mobilvideo blir ofte flere ganger mindre.
//
// Den nye fila brukes bare hvis den er mindre, eller hvis originalen ikke kan
// spilles av alle (HEVC, 4K, 60 bilder i sekundet …). Den får en ny nøkkel, og
// media.rev økes, så adressen /m/<id>v<rev>.mp4 er ny – mellomlagre hos
// Cloudflare og skjermene blander aldri gammel og ny fil.
//
// Én video om gangen, med lav prioritet. Videoer som var i arbeid da serveren
// stoppet, tas opp igjen ved oppstart (resumeVideos).

import { spawn, spawnSync } from 'node:child_process';
import { open, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { platformDb, tenantResources } from './platform.js';
import { notifyChange } from './changes.js';

const MAX_SIDE = 1920;
const MAX_FPS = 30;
const MAX_GOOD_BITRATE = 8_000_000; // H.264 under dette får være som det er
const TIMEOUT_MS = 45 * 60_000;

/** Finnes ffmpeg på maskinen? (Docker-bildet har det, se Dockerfile.) */
export const videoSupported = (() => {
  try {
    return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
})();

const queue = [];
let running = false;

/** Legg en video i køen (kalles etter opplasting). */
export function queueVideo(slug, mediaId) {
  if (!videoSupported || queue.some((j) => j.slug === slug && j.mediaId === mediaId)) return;
  queue.push({ slug, mediaId });
  run();
}

async function run() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      try {
        await compress(job);
      } catch (err) {
        console.error(`[video] ${job.slug} #${job.mediaId}:`, err.message);
        await setStatus(job, null).catch(() => {});
      }
    }
  } finally {
    running = false;
  }
}

function exec(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} feilet (${code}): ${err.split('\n').filter(Boolean).slice(-2).join(' ')}`));
    });
  });
}

const setStatus = ({ slug, mediaId }, status) =>
  tenantResources(slug).DB.prepare('UPDATE media SET status = ? WHERE id = ?').bind(status, mediaId).run();

/** Ligger «moov» (oversikten over fila) før selve dataene? Da kan avspillingen starte med en gang. */
async function moovFirst(file) {
  const fh = await open(file, 'r');
  try {
    const buf = Buffer.alloc(16);
    let pos = 0;
    for (let i = 0; i < 30; i++) {
      const { bytesRead } = await fh.read(buf, 0, 16, pos);
      if (bytesRead < 8) return false;
      let size = buf.readUInt32BE(0);
      const type = buf.toString('latin1', 4, 8);
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (size === 1) size = Number(buf.readBigUInt64BE(8));
      if (size < 8) return false;
      pos += size;
    }
    return false;
  } finally {
    await fh.close();
  }
}

const fpsOf = (s) => {
  const [a, b] = String(s?.avg_frame_rate || s?.r_frame_rate || '0/1').split('/').map(Number);
  return b ? a / b : 0;
};

async function compress(job) {
  const { DB, MEDIA } = tenantResources(job.slug);
  const row = await DB.prepare('SELECT * FROM media WHERE id = ?').bind(job.mediaId).first();
  if (!row || !/^video\//i.test(row.content_type || '')) return;
  const input = MEDIA.localPath(row.r2_key);
  await setStatus(job, 'processing');

  const probe = JSON.parse(await exec('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', input]));
  const video = (probe.streams || []).find((s) => s.codec_type === 'video');
  const audio = (probe.streams || []).find((s) => s.codec_type === 'audio');
  if (!video) return setStatus(job, null);
  const bitrate = Number(probe.format?.bit_rate) || 0;
  const playable =
    video.codec_name === 'h264' &&
    /yuv420p/.test(video.pix_fmt || '') &&
    Math.max(video.width, video.height) <= MAX_SIDE &&
    fpsOf(video) <= MAX_FPS + 1 &&
    (!audio || audio.codec_name === 'aac');
  if (playable && bitrate <= MAX_GOOD_BITRATE && (await moovFirst(input))) return setStatus(job, null);

  const output = `${input}.flatr.mp4`;
  try {
    const scale = `scale='if(gte(iw,ih),trunc(min(${MAX_SIDE},iw)/2)*2,-2)':'if(gte(iw,ih),-2,trunc(min(${MAX_SIDE},ih)/2)*2)'`;
    await exec('nice', [
      '-n', '10', 'ffmpeg', '-hide_banner', '-nostdin', '-y', '-i', input,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-vf', scale, '-fpsmax', String(MAX_FPS),
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      '-movflags', '+faststart', '-max_muxing_queue_size', '1024',
      output
    ]);
    const { size } = await stat(output);
    // Spilles originalen allerede av alle, beholdes den med mindre den nye er klart mindre.
    if (playable && size > row.size * 0.9) return setStatus(job, null);

    const current = await DB.prepare('SELECT r2_key, rev FROM media WHERE id = ?').bind(job.mediaId).first();
    if (!current || current.r2_key !== row.r2_key) return; // slettet eller byttet mens vi jobbet
    const key = `media/${randomUUID()}`;
    await MEDIA.putFile(key, output, { httpMetadata: { contentType: 'video/mp4' } });
    await DB.prepare(
      `UPDATE media SET r2_key = ?, size = ?, content_type = 'video/mp4', rev = rev + 1, status = NULL,
         original_size = COALESCE(original_size, ?), name = ? WHERE id = ?`
    )
      .bind(key, size, row.size, String(row.name || 'video').replace(/\.[a-z0-9]+$/i, '') + '.mp4', job.mediaId)
      .run();
    await MEDIA.delete(row.r2_key);
    notifyChange(job.slug);
    console.log(`[video] ${job.slug} #${job.mediaId}: ${(row.size / 1e6).toFixed(1)} MB -> ${(size / 1e6).toFixed(1)} MB`);
  } finally {
    await rm(output, { force: true });
  }
}

/** Ved oppstart: videoer som sto i kø eller var i arbeid da serveren stoppet. */
export async function resumeVideos() {
  if (!videoSupported) return;
  for (const { slug } of platformDb.prepare('SELECT slug FROM tenants').allSync().results) {
    try {
      const { results } = await tenantResources(slug).DB.prepare(`SELECT id FROM media WHERE status IN ('queued', 'processing')`).all();
      for (const r of results ?? []) queueVideo(slug, r.id);
    } catch {
      /* kunde uten database */
    }
  }
}
