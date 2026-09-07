// Cloudflare Access-identitet.
//
// I produksjon står Cloudflare Access foran Worker-en. Hver forespørsel (også
// WebSocket-oppgraderinger) får da headeren `Cf-Access-Jwt-Assertion` med et
// signert JWT. Vi verifiserer det mot teamets JWKS og henter e-posten.
//
// Konfig (wrangler.jsonc vars, eller secrets):
//   ACCESS_TEAM_DOMAIN = "<team>.cloudflareaccess.com"
//   ACCESS_AUD         = "<application audience tag>"
// Er de ikke satt (lokal utvikling) faller vi tilbake til DEV_USER_EMAIL,
// eventuelt overstyrt pr. forespørsel med ?as=<navn> (kun i denne modusen).

// Faste, godt adskilte farger – én pr. bruker, deterministisk fra e-post.
const PALETTE = [
  '#e5484d',
  '#f76b15',
  '#ffb224',
  '#46a758',
  '#12a594',
  '#00a2c7',
  '#3e63dd',
  '#8e4ec6',
  '#d6409f',
  '#e93d82',
  '#c2410c',
  '#5b5bd6',
  '#0d9488',
  '#65a30d',
  '#db2777'
];
export const userColorPalette = () => PALETTE.slice();

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return new Uint8Array(buf);
}
async function colorFor(email) {
  const h = await sha256(email.toLowerCase());
  return PALETTE[h[0] % PALETTE.length];
}

const b64urlToBytes = (s) => {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 ? '='.repeat(4 - (norm.length % 4)) : '';
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

let jwksCache = { url: null, at: 0, keys: null };
async function getJwks(teamDomain) {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  if (jwksCache.url === url && jwksCache.keys && Date.now() - jwksCache.at < 3_600_000) {
    return jwksCache.keys;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('kunne ikke hente Access-nøkler');
  const { keys } = await res.json();
  jwksCache = { url, at: Date.now(), keys };
  return keys;
}

async function verifyAccessJwt(token, { teamDomain, aud }) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('ugyldig token');
  const header = b64urlToJson(h);
  const payload = b64urlToJson(p);

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now - 30) throw new Error('token utløpt');
  if (payload.iss && payload.iss !== `https://${teamDomain}`) throw new Error('feil issuer');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (aud && !auds.includes(aud)) throw new Error('feil audience');

  const jwk = (await getJwks(teamDomain)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('ukjent nøkkel');
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`)
  );
  if (!ok) throw new Error('signatur feilet');
  return payload;
}

function makeUser(email, sub) {
  const e = String(email || '').toLowerCase().trim();
  return colorFor(e).then((color) => ({
    email: e,
    name: e.split('@')[0] || 'bruker',
    color,
    sub: sub || e
  }));
}

/**
 * Henter innlogget bruker, eller null hvis ingen gyldig identitet (og Access er
 * konfigurert). I lokal modus returneres alltid en bruker.
 * @returns {Promise<{email:string,name:string,color:string,sub:string}|null>}
 */
export async function getUser(request, env) {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;

  if (teamDomain && aud) {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) return null;
    try {
      const claims = await verifyAccessJwt(token, { teamDomain, aud });
      const email = claims.email || claims.identity || claims.sub;
      if (!email || !String(email).includes('@')) return null;
      return await makeUser(email, claims.sub);
    } catch {
      return null;
    }
  }

  // Lokal utvikling – ingen Access. ?as=<navn> lar deg teste flere brukere.
  const as = new URL(request.url).searchParams.get('as');
  const base = env.DEV_USER_EMAIL || 'lokal@dev.test';
  const email = as ? `${as.replace(/[^a-z0-9._-]/gi, '')}@dev.test` : base;
  return makeUser(email, 'dev');
}
