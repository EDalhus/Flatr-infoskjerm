// Adresser fra innhold (widgeter, bilder, bakgrunner, knapper) skal bare være
// vanlige nettadresser eller stier på Flatr – aldri javascript:, data: o.l.,
// som ellers kunne kjørt kode i kundens domene (iframe, lenker).

/** Adressen hvis den er http(s) eller en sti her («/api/…», «/m/…»), ellers ''. */
export function safeUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\')) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

/** Bare eksterne http(s)-adresser (nettside-widgeter i iframe). */
export function externalUrl(raw) {
  const s = safeUrl(raw);
  return /^https?:\/\//i.test(s) ? s : '';
}

// Feltene i elementenes config som er adresser.
const URL_KEYS = ['url', 'image_url', 'logo', 'poster', 'data_url'];

/** Config med alle adresse-felt vasket (også bildelister i karuseller). */
export function cleanConfigUrls(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return config;
  const out = { ...config };
  for (const k of URL_KEYS) if (typeof out[k] === 'string') out[k] = safeUrl(out[k]);
  if (Array.isArray(out.images)) out.images = out.images.map((i) => (i && typeof i === 'object' ? { ...i, url: safeUrl(i.url) } : i));
  return out;
}

/** Bakgrunn med vasket bildeadresse. */
export function cleanBackground(bg) {
  if (!bg || typeof bg !== 'object' || Array.isArray(bg)) return bg;
  return typeof bg.url === 'string' ? { ...bg, url: safeUrl(bg.url) } : bg;
}
