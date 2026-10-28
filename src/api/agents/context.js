// Fast kontekst for AI-assistenten: dokumenter kunden vil at AI-en alltid skal
// følge (merkevareretningslinjer, tone, faste opplysninger). Tre typer:
//   pdf  – opplastet eller hentet fra en lenke (AI-en leser hele PDF-en, også bildene)
//   link – nettside: teksten hentes ut, og et skjermbilde viser farger og logo
//   text – limt inn
// Metadata ligger i assistent-appens config.context; innholdet i MEDIA under
// ai-context/. Elementer slettes aldri fra lagringen (bare arkiveres), så eldre
// samtaler som viser til dem forblir uendret.

const MAX_ITEMS = 20;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_TEXT = 60_000;
const UA = 'Flatr-infoskjerm/1.0 (+https://flatr.no)';

export const publicItem = (i) => ({ id: i.id, kind: i.kind, title: i.title, url: i.url || null, size: i.size || null, added_at: i.added_at });
export const activeItems = (config) => (config?.context || []).filter((i) => !i.archived);

const newId = () => crypto.randomUUID().slice(0, 12);

async function putBlob(env, data, contentType) {
  const key = `ai-context/${crypto.randomUUID()}`;
  await env.MEDIA.put(key, data, { httpMetadata: { contentType } });
  return key;
}

async function getBlob(env, key) {
  if (!key) return null;
  const obj = await env.MEDIA.get(key);
  if (!obj) return null;
  return Buffer.from(await new Response(obj.body).arrayBuffer());
}

/* ------------------------- nettsider: trygg henting ------------------------ */

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/** Bare offentlige http(s)-adresser (serveren skal ikke kunne nå interne tjenester). */
async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('Ugyldig adresse');
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Bruk en http- eller https-adresse');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') || /\.(local|internal|lan)$/i.test(host)) throw new Error('Adressen må være offentlig tilgjengelig');
  const { lookup } = await import('node:dns/promises');
  const addrs = await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('Fant ikke adressen');
  for (const { address, family } of addrs) {
    const bad = family === 4 ? PRIVATE_V4.some((r) => r.test(address)) : /^(::1|fc|fd|fe80|::ffff:(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i.test(address);
    if (bad) throw new Error('Adressen må være offentlig tilgjengelig');
  }
  return url;
}

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

/** Leselig tekst fra HTML: overskrifter og avsnitt på egne linjer. */
function htmlToText(html) {
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim());
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<h([1-6])[^>]*>/gi, (_, n) => `\n${'#'.repeat(Number(n))} `)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { title, text: text.slice(0, MAX_TEXT) };
}

/* --------------------------------- legg til -------------------------------- */

function withItem(config, item) {
  const active = activeItems(config);
  if (active.length >= MAX_ITEMS) throw new Error(`Maks ${MAX_ITEMS} kontekstdokumenter`);
  return { ...config, context: [...(config.context || []), item] };
}

export async function addPdf(env, config, data, title) {
  const buf = Buffer.from(data);
  if (buf.length > MAX_PDF_BYTES) throw new Error('PDF-en er for stor (maks 25 MB)');
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Filen er ikke en PDF');
  const key = await putBlob(env, buf, 'application/pdf');
  return withItem(config, { id: newId(), kind: 'pdf', title: String(title || 'Dokument.pdf').slice(0, 120), key, size: buf.length, added_at: new Date().toISOString() });
}

export async function addText(env, config, text, title) {
  const body = String(text || '').trim().slice(0, MAX_TEXT);
  if (!body) throw new Error('Skriv inn teksten');
  const key = await putBlob(env, body, 'text/plain; charset=utf-8');
  return withItem(config, { id: newId(), kind: 'text', title: String(title || body.split('\n')[0]).slice(0, 120), key, size: body.length, added_at: new Date().toISOString() });
}

/** Lenke: PDF lagres som PDF; nettsider blir tekst + skjermbilde (hvis mulig). */
export async function addLink(env, config, rawUrl, title) {
  const url = await assertPublicUrl(rawUrl);
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/pdf,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Siden svarte ${res.status}`);
  await assertPublicUrl(res.url); // etter videresendinger
  const type = res.headers.get('content-type') || '';
  const len = Number(res.headers.get('content-length')) || 0;
  if (len > MAX_PDF_BYTES) throw new Error('Filen er for stor (maks 25 MB)');
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_PDF_BYTES) throw new Error('Filen er for stor (maks 25 MB)');

  if (/application\/pdf/i.test(type) || data.subarray(0, 5).toString() === '%PDF-') {
    const key = await putBlob(env, data, 'application/pdf');
    const name = title || decodeURIComponent(url.pathname.split('/').pop() || url.hostname);
    return withItem(config, { id: newId(), kind: 'pdf', title: String(name).slice(0, 120), url: url.href, key, size: data.length, added_at: new Date().toISOString() });
  }
  if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) throw new Error('Lenken må gå til en nettside eller en PDF');

  const { title: pageTitle, text } = htmlToText(data.toString('utf8'));
  if (text.length < 40) throw new Error('Fant nesten ingen tekst på siden. Prøv en PDF i stedet.');
  const key = await putBlob(env, text, 'text/plain; charset=utf-8');
  // Skjermbilde av toppen av siden, så AI-en ser farger, logo og stil.
  let imageKey = null;
  if (env.SCREENSHOT) {
    try {
      const img = await env.SCREENSHOT(url.href, { width: 1280, height: 1600, waitSeconds: 3 });
      imageKey = await putBlob(env, Buffer.from(img), 'image/jpeg');
    } catch {
      imageKey = null; // teksten holder
    }
  }
  return withItem(config, {
    id: newId(),
    kind: 'link',
    title: String(title || pageTitle || url.hostname).slice(0, 120),
    url: url.href,
    key,
    image_key: imageKey,
    size: text.length,
    added_at: new Date().toISOString()
  });
}

export function archiveItem(config, id) {
  return { ...config, context: (config.context || []).map((i) => (i.id === id ? { ...i, archived: true } : i)) };
}

/**
 * Innholdet til AI-en for gitte id-er (også arkiverte – eldre meldinger viser
 * til dem). -> [{ id, kind, title, url, pdf?: base64, text?: string, image?: base64 }]
 */
export async function loadItems(env, config, ids) {
  const byId = new Map((config.context || []).map((i) => [i.id, i]));
  const out = [];
  for (const id of ids || []) {
    const i = byId.get(id);
    if (!i) continue;
    const blob = await getBlob(env, i.key);
    const item = { id: i.id, kind: i.kind, title: i.title, url: i.url || null };
    if (!blob) item.text = '(Dokumentet er ikke lenger tilgjengelig.)';
    else if (i.kind === 'pdf') item.pdf = blob.toString('base64');
    else item.text = blob.toString('utf8');
    if (i.image_key) {
      const img = await getBlob(env, i.image_key);
      if (img) item.image = img.toString('base64');
    }
    out.push(item);
  }
  return out;
}
