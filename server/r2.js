// R2-kompatibel bucket på lokal disk (env.MEDIA).
//
// Dekker det src/api/media.js og trash.js bruker: put(key, body, opts),
// get(key) -> { body }, delete(key). Content-Type lagres i en sidecar-fil.

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

export class DiskBucket {
  constructor(root) {
    this.root = root;
  }

  #file(key) {
    const safe = path.normalize(String(key)).replace(/^(\.\.(\/|\\|$))+/, '');
    const full = path.join(this.root, safe);
    if (!full.startsWith(this.root + path.sep)) throw new Error('ugyldig nøkkel');
    return full;
  }

  async put(key, body, opts = {}) {
    const file = this.#file(key);
    await mkdir(path.dirname(file), { recursive: true });
    if (body instanceof ReadableStream) {
      await pipeline(Readable.fromWeb(body), createWriteStream(file));
    } else {
      await writeFile(file, body instanceof ArrayBuffer ? new Uint8Array(body) : body);
    }
    const meta = { contentType: opts.httpMetadata?.contentType || 'application/octet-stream' };
    await writeFile(`${file}.meta.json`, JSON.stringify(meta));
    const { size } = await stat(file);
    return { key, size, httpMetadata: meta };
  }

  // `opts.range` = { offset, length } (samme form som R2) for delvis henting.
  async get(key, opts = {}) {
    const file = this.#file(key);
    let info;
    try {
      info = await stat(file);
    } catch {
      return null;
    }
    const meta = await readFile(`${file}.meta.json`, 'utf8')
      .then(JSON.parse)
      .catch(() => ({}));
    const r = opts.range;
    const stream = r
      ? { start: r.offset ?? 0, end: r.length != null ? (r.offset ?? 0) + r.length - 1 : undefined }
      : {};
    return {
      key,
      size: info.size,
      httpMetadata: meta,
      range: r ? { offset: stream.start, length: (stream.end ?? info.size - 1) - stream.start + 1 } : undefined,
      get body() {
        return Readable.toWeb(createReadStream(file, stream));
      }
    };
  }

  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      const file = this.#file(key);
      await rm(file, { force: true });
      await rm(`${file}.meta.json`, { force: true });
    }
  }
}
