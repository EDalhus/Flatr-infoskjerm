// Henting av eksterne adresser kunden har lagt inn (RSS, kalendere, kampprogram):
// bare offentlige adresser – også etter omdirigeringer – og med størrelsesgrense.

export const UA = 'Flatr-infoskjerm/1.0 (+https://flatr.no)';
export const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** Avviser adresser som peker inn i private nett (bare på Node, der vi kan slå opp DNS). */
export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).replace(/^webcals?:/i, 'https:'));
  } catch {
    throw new Error('Ugyldig adresse');
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Bare http(s)-adresser');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname) || !url.hostname.includes('.')) {
    throw new Error('Adressen er ikke tillatt');
  }
  let lookup;
  try {
    ({ lookup } = await import('node:dns/promises'));
  } catch {
    return url; // Worker: ingen DNS-oppslag, men Workers når uansett ikke interne nett
  }
  const addrs = await lookup(url.hostname, { all: true });
  const privateIp = (ip) =>
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip) ||
    /^(::1|::ffff:(10|127|169\.254|192\.168)\.|fc|fd|fe80)/i.test(ip);
  if (addrs.some((a) => privateIp(a.address))) throw new Error('Adressen er ikke tillatt');
  return url;
}

/**
 * Innhold fra en offentlig adresse: { bytes, type }. Omdirigeringer følges
 * (maks tre), og hver ny adresse sjekkes.
 */
export async function fetchBytes(raw, { accept = '*/*', timeout = 10_000, maxBytes = MAX_BYTES } = {}) {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: accept },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout)
    });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (location) {
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`Kilden svarte ${res.status}`);
    const len = Number(res.headers.get('content-length'));
    if (len > maxBytes) throw new Error('Kilden er for stor');
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error('Kilden er for stor');
    return { bytes, type: res.headers.get('content-type') || '' };
  }
  throw new Error('For mange omdirigeringer');
}

/** Tekst fra en offentlig adresse (se fetchBytes). */
export async function fetchText(raw, opts = {}) {
  const { bytes } = await fetchBytes(raw, opts);
  return new TextDecoder().decode(bytes);
}
