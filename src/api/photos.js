import { checkLimit } from './_shared.js';

// Flatr-appen «Unsplash bildebank»: søk etter bilder og hent dem inn i
// mediebiblioteket (mappen Unsplash). Hver konto bruker sin egen gratis
// Access Key. Unsplash krever at nedlastinger meldes (download_location) og at
// fotografen krediteres – navnet ligger i filnavnet i biblioteket.

const API = 'https://api.unsplash.com';
const UA = 'Flatr-infoskjerm/1.0 (+https://flatr.no)';
const headers = (key) => ({ Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1', 'User-Agent': UA });

async function unsplash(key, path) {
  const res = await fetch(`${API}${path}`, { headers: headers(key), signal: AbortSignal.timeout(15_000) });
  if (res.status === 401) throw new Error('Unsplash godtok ikke nøkkelen');
  if (res.status === 403) throw new Error('Unsplash: grensen for antall forespørsler i timen er nådd. Prøv igjen senere.');
  if (!res.ok) throw new Error(`Unsplash svarte ${res.status}`);
  return res.json();
}

export async function verifyUnsplashKey(key) {
  if (!/^[\w-]{20,80}$/.test(key)) throw new Error('Det ser ikke ut som en Unsplash Access Key');
  await unsplash(key, '/search/photos?query=fjord&per_page=1');
}

/** -> [{ id, thumb, preview, width, height, alt, author, author_url, color }] */
export async function searchPhotos(key, query, { orientation, page = 1 } = {}) {
  const q = new URLSearchParams({ query: String(query || '').slice(0, 100), per_page: '24', page: String(page), content_filter: 'high' });
  if (['landscape', 'portrait', 'squarish'].includes(orientation)) q.set('orientation', orientation);
  const data = await unsplash(key, `/search/photos?${q}`);
  return (data.results || []).map((p) => ({
    id: p.id,
    thumb: p.urls?.small,
    preview: p.urls?.regular,
    width: p.width,
    height: p.height,
    alt: p.alt_description || p.description || '',
    author: p.user?.name || 'Ukjent',
    author_url: `${p.user?.links?.html || 'https://unsplash.com'}?utm_source=flatr&utm_medium=referral`,
    color: p.color
  }));
}

/** Henter bildet inn i mediebiblioteket (mappen Unsplash). -> media-rad */
export async function importPhoto(env, key, id) {
  if (!/^[\w-]{5,40}$/.test(String(id || ''))) throw new Error('Ugyldig bilde');
  const p = await unsplash(key, `/photos/${id}`);
  // Påkrevd av Unsplash: meld fra om nedlastingen.
  if (p.links?.download_location) await fetch(p.links.download_location, { headers: headers(key) }).catch(() => {});
  const res = await fetch(`${p.urls.raw}&w=2400&q=82&fm=jpg&fit=max`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error('Kunne ikke laste ned bildet');
  const data = Buffer.from(await res.arrayBuffer());
  const full = await checkLimit(env, 'storage', data.length);
  if (full) throw new Error('Lagringsplassen er full');
  const alt = (p.alt_description || p.description || 'Bilde').slice(0, 80);
  const name = `${alt.charAt(0).toUpperCase()}${alt.slice(1)} – foto: ${p.user?.name || 'ukjent'} (Unsplash).jpg`.slice(0, 200);
  const r2 = `media/${crypto.randomUUID()}`;
  const put = await env.MEDIA.put(r2, data, { httpMetadata: { contentType: 'image/jpeg' } });
  return env.DB.prepare('INSERT INTO media (name, folder, r2_key, content_type, size) VALUES (?, ?, ?, ?, ?) RETURNING *')
    .bind(name, 'Unsplash', r2, 'image/jpeg', put?.size ?? data.length)
    .first();
}
