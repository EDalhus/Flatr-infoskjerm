// Erstatning for Workers' ASSETS-binding: serverer Vite-bygget i ./dist med
// SPA-fallback til index.html (samme som not_found_handling i wrangler.jsonc).

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

export function createAssets(root) {
  const indexFile = path.join(root, 'index.html');

  async function serve(file, status = 200) {
    const body = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    // Vite-filer i /assets/ har hash i navnet og kan caches for alltid.
    const immutable = file.includes(`${path.sep}assets${path.sep}`);
    return new Response(body, {
      status,
      headers: {
        'Content-Type': TYPES[ext] || 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
      }
    });
  }

  return {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const rel = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, '');
      const file = path.join(root, rel);
      if (file.startsWith(root + path.sep)) {
        try {
          if ((await stat(file)).isFile()) return await serve(file);
        } catch {
          /* faller gjennom til SPA */
        }
      }
      return serve(indexFile);
    }
  };
}
