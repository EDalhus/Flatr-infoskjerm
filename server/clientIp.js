// Den ekte klient-IP-en, til bremsene mot passordgjetting o.l.
//
// nginx setter X-Real-IP til avsenderen av TCP-forbindelsen. Er det Cloudflare
// (vanlig trafikk), er klienten i CF-Connecting-IP. Er det ikke Cloudflare
// (noen går direkte mot serverens IP), stoles det IKKE på CF-Connecting-IP –
// ellers kunne hvem som helst late som de kom fra en ny IP for hvert forsøk.
// Med deploy/cloudflare.sh er X-Real-IP allerede den ekte klienten.

// https://www.cloudflare.com/ips (oppdateres sjelden; deploy/cloudflare.sh henter lista på nytt for brannmuren).
const CLOUDFLARE = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'
];

function toBig(ip) {
  if (ip.includes(':')) {
    let [head, tail = ''] = ip.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const parts = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
    if (parts.length !== 8) return null;
    return { v: parts.reduce((n, p) => (n << 16n) | BigInt(parseInt(p || '0', 16)), 0n), bits: 128 };
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((x) => !(x >= 0 && x <= 255))) return null;
  return { v: p.reduce((n, x) => (n << 8n) | BigInt(x), 0n), bits: 32 };
}

const RANGES = CLOUDFLARE.map((c) => {
  const [ip, len] = c.split('/');
  const b = toBig(ip);
  return { ...b, len: BigInt(len) };
});

export function isCloudflare(raw) {
  const ip = toBig(String(raw || '').replace(/^::ffff:/, '').trim());
  if (!ip) return false;
  return RANGES.some((r) => r.bits === ip.bits && ip.v >> BigInt(r.bits) - r.len === r.v >> BigInt(r.bits) - r.len);
}

/** Klient-IP fra hodene nginx satte (se forklaringen øverst). */
export function trustedClientIp(headers) {
  const peer = headers.get('x-real-ip') || '';
  if (peer && isCloudflare(peer)) return headers.get('cf-connecting-ip') || peer;
  return peer || 'ukjent';
}
