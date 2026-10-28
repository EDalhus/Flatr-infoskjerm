// Felles hjelpere for AIS-appen (skipstrafikk), brukt både i adminpanelet og
// på skjermene: navigasjonsstatus, avstand, ETA og «sist sett».

// AIS navigasjonsstatus (ITU-R M.1371). 15 = ikke oppgitt.
export const NAV_STATUS = {
  0: 'Underveis',
  1: 'For anker',
  2: 'Ikke under kommando',
  3: 'Begrenset manøvrering',
  4: 'Begrenset av dypgang',
  5: 'Ved kai',
  6: 'På grunn',
  7: 'Fisker',
  8: 'Underveis (seil)'
};

// Skipsklasser etter AIS skipstype (ITU-R M.1371), med fargekoden som er vanlig
// på offentlige og kommersielle AIS-kart (Kystverket, MarineTraffic m.fl.).
export const SHIP_CLASSES = [
  { id: 'passenger', label: 'Passasjer', color: '#3b82f6' },
  { id: 'cargo', label: 'Lasteskip', color: '#4caf50' },
  { id: 'tanker', label: 'Tankskip', color: '#e5484d' },
  { id: 'highspeed', label: 'Hurtiggående', color: '#facc15' },
  { id: 'fishing', label: 'Fiskefartøy', color: '#f59e0b' },
  { id: 'special', label: 'Slep og spesialfartøy', color: '#2dd4bf' },
  { id: 'pleasure', label: 'Fritidsbåt', color: '#c084fc' },
  { id: 'other', label: 'Annet', color: '#9ca3af' }
];
const CLASS_BY_ID = Object.fromEntries(SHIP_CLASSES.map((c) => [c.id, c]));

/** Skipsklassen til en AIS skipstype (tall 0–99). */
export function shipClass(type) {
  const t = Number(type);
  if (t >= 60 && t <= 69) return CLASS_BY_ID.passenger;
  if (t >= 70 && t <= 79) return CLASS_BY_ID.cargo;
  if (t >= 80 && t <= 89) return CLASS_BY_ID.tanker;
  if (t >= 40 && t <= 49) return CLASS_BY_ID.highspeed;
  if (t === 30) return CLASS_BY_ID.fishing;
  if ([31, 32, 33, 34, 35, 50, 51, 52, 53, 54, 55, 58, 59].includes(t)) return CLASS_BY_ID.special;
  if (t === 36 || t === 37) return CLASS_BY_ID.pleasure;
  return CLASS_BY_ID.other;
}

/** Fargen en båt skal vises med: skipsklasse (standard) eller flåtens egen farge. */
export const vesselColor = (v, colorBy = 'type') => (colorBy === 'own' ? v.color : shipClass(v.shipType).color);

const MOVING_KNOTS = 0.5; // under dette regnes båten som stille
const AT_QUAY_NM = 0.3; // nærmere kaia enn dette = fremme

/** Avstand i nautiske mil (storsirkel). */
export function distanceNm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const hasPosition = (v) => Number.isFinite(v?.lat) && Number.isFinite(v?.lon);
export const isMoving = (v) => Number(v?.sog) >= MOVING_KNOTS;

/** Status-tekst for en båt: AIS-status, men «Underveis»/«Ligger stille» ut fra farten. */
export function statusLabel(v) {
  if (!v || v.missing) return 'Ingen AIS-data';
  const s = NAV_STATUS[v.navStatus];
  if (v.navStatus === 0 || v.navStatus === 8 || s == null) return isMoving(v) ? 'Underveis' : 'Ligger stille';
  return s;
}

/**
 * Estimert ankomst til en kai ut fra posisjon, fart og luftlinje.
 * { state: 'arrived' | 'eta' | 'still' | 'unknown', distanceNm, eta: Date|null }
 * Luftlinje er optimistisk langs kysten – vis det som et estimat.
 */
export function etaTo(v, quay, now = Date.now()) {
  if (!hasPosition(v) || !hasPosition(quay)) return { state: 'unknown', distanceNm: null, eta: null };
  const d = distanceNm(v, quay);
  if (d <= AT_QUAY_NM) return { state: 'arrived', distanceNm: d, eta: null };
  if (!isMoving(v)) return { state: 'still', distanceNm: d, eta: null };
  return { state: 'eta', distanceNm: d, eta: new Date(now + (d / Number(v.sog)) * 3600_000) };
}

export const formatClock = (date) =>
  date ? date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '–';

/** «nå», «for 4 min siden», «for 2 t siden», «for 3 d siden». */
export function ago(iso, now = Date.now()) {
  if (!iso) return 'aldri';
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return 'nå';
  if (min < 60) return `for ${min} min siden`;
  const h = Math.round(min / 60);
  if (h < 48) return `for ${h} t siden`;
  return `for ${Math.round(h / 24)} d siden`;
}

/** Kort ETA-tekst til kort og tavler. */
export function etaText(e) {
  if (e.state === 'arrived') return 'Ved kaia';
  if (e.state === 'still') return 'Ligger stille';
  if (e.state === 'eta') {
    const min = Math.round((e.eta.getTime() - Date.now()) / 60_000);
    if (min < 60) return `ca. ${formatClock(e.eta)} (${Math.max(1, min)} min)`;
    if (e.eta.toDateString() === new Date().toDateString()) return `ca. ${formatClock(e.eta)}`;
    const day = e.eta.toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', '');
    return `ca. ${day} ${formatClock(e.eta)}`;
  }
  return '–';
}

/** Gyldig MMSI: 9 siffer. */
export const validMmsi = (m) => /^\d{9}$/.test(String(m ?? '').trim());
