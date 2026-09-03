// Delte hjelpere for enhets-/parringsvisningen.

export const codeDisplay = (code) => `${code.slice(0, 3)}-${code.slice(3)}`;

// Navn på enheten: eget kallenavn > enhetens rapporterte navn > selve koden.
export const displayName = (p) =>
  p.label || p.client_info?.device_name || codeDisplay(p.code);

// Status-pill: Live / Frakoblet / Venter / Utløpt.
export function deviceStatus(p) {
  if (p.status === 'pending') return { key: 'pending', label: 'Venter', cls: 'bg-badge text-badge-ink' };
  if (p.status === 'expired') return { key: 'expired', label: 'Utløpt', cls: 'bg-danger-tint text-danger' };
  if (p.online) return { key: 'live', label: 'Live', cls: 'bg-ok-tint text-ok' };
  return { key: 'offline', label: 'Frakoblet', cls: 'bg-hair text-muted' };
}

// "arm64 · tvOS 18.2 · app 1.0.3 · 1920×1080"
export function clientSummary(ci) {
  if (!ci) return null;
  const parts = [];
  if (ci.model) parts.push(ci.model);
  if (ci.os_version || ci.tvos_version) parts.push(`tvOS ${ci.os_version || ci.tvos_version}`);
  if (ci.app_version) parts.push(`app ${ci.app_version}`);
  if (ci.resolution) parts.push(ci.resolution.replace('x', '×'));
  return parts.join(' · ') || null;
}

export function timeAgo(iso) {
  if (!iso) return '–';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'nå nettopp';
  if (s < 3600) return `${Math.floor(s / 60)} min siden`;
  if (s < 86400) return `${Math.floor(s / 3600)} t siden`;
  return `${Math.floor(s / 86400)} d siden`;
}

// Tid FRAM til et framtidig tidspunkt: "12 min", "1 t", "straks".
export function timeUntil(iso) {
  if (!iso) return '';
  const s = (Date.parse(iso) - Date.now()) / 1000;
  if (s <= 0) return 'straks';
  if (s < 60) return 'under 1 min';
  if (s < 3600) return `${Math.ceil(s / 60)} min`;
  return `${Math.round(s / 3600)} t`;
}

// 93784 -> "1d 2t 3m"
export function fmtUptime(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s) || s < 0) return null;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d ? `${d}d` : null, d || h ? `${h}t` : null, `${m}m`].filter(Boolean).join(' ');
}

// "1920x1080" -> "16:9"
export function aspectOf(resolution) {
  const m = /^(\d+)\s*[x×]\s*(\d+)$/.exec(String(resolution || '').trim());
  if (!m) return null;
  let [w, h] = [Number(m[1]), Number(m[2])];
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(w, h) || 1;
  return `${w / g}:${h / g}`;
}
