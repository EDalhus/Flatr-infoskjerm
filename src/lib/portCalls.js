// Anløp (tillegg i NAIS): båtanløp man vet om på forhånd – hvilken båt, hvilken
// kai, forventet ankomst/avgang, neste havn og hvilke varer som lastes eller
// losses. Lagres i NAIS-appens config.calls. Felles for server og nettleser.
//
// Tider er lokale kalendertider uten sone, og tolkes i nettleserens (kundens)
// tidssone: "2026-11-02T14:30", eller bare dato "2026-11-02" når klokkeslettet
// ikke er kjent.

export const CARGO_DIRS = [
  { value: 'unload', label: 'Leverer', short: 'Lossing', icon: '↓' },
  { value: 'load', label: 'Henter', short: 'Lasting', icon: '↑' }
];
export const UNITS = ['tonn', 'm³', 'stk', 'paller', 'containere', 'big bags', 'liter'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const str = (v, max = 100) => String(v ?? '').trim().slice(0, max);
const time = (v) => {
  const s = String(v ?? '');
  if (TIME_RE.test(s.slice(0, 16))) return s.slice(0, 16);
  return DATE_RE.test(s.slice(0, 10)) ? s.slice(0, 10) : null;
};

/** Har tidspunktet klokkeslett, eller bare dato? */
export const hasClock = (t) => typeof t === 'string' && t.length > 10;

/** Lokal Date. Bare dato -> starten av dagen (end = true: slutten av dagen). */
export function callDate(t, end = false) {
  if (!t) return null;
  if (hasClock(t)) return new Date(t);
  const [y, m, d] = t.split('-').map(Number);
  return end ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d);
}

/** Renser anløp fra admin. Ugyldige droppes; maks 300 anløp, 20 varelinjer hver. */
export function cleanCalls(input) {
  const out = [];
  for (const c of Array.isArray(input) ? input : []) {
    const eta = time(c?.eta);
    const name = str(c?.name, 80);
    const mmsi = /^\d{9}$/.test(String(c?.mmsi ?? '')) ? String(c.mmsi) : null;
    if (!eta || (!name && !mmsi)) continue;
    const cargo = [];
    for (const g of Array.isArray(c?.cargo) ? c.cargo : []) {
      const goods = str(g?.goods, 80);
      if (!goods) continue;
      const qty = Number(g?.qty);
      cargo.push({
        dir: g?.dir === 'load' ? 'load' : 'unload',
        goods,
        qty: Number.isFinite(qty) && qty > 0 ? Math.round(qty * 1000) / 1000 : null,
        unit: str(g?.unit, 20) || null
      });
      if (cargo.length >= 20) break;
    }
    out.push({
      id: str(c?.id, 40) || Math.random().toString(36).slice(2, 10),
      mmsi,
      name: name || null,
      quayId: str(c?.quayId, 40) || null,
      eta,
      etd: time(c?.etd),
      from: str(c?.from, 60) || null,
      next: str(c?.next, 60) || null,
      cargo,
      note: str(c?.note, 200) || null
    });
    if (out.length >= 300) break;
  }
  return out.sort((a, b) => a.eta.localeCompare(b.eta));
}

const ms = (t, end) => callDate(t, end)?.getTime() ?? NaN;

/**
 * Anløp som er aktuelle nå: fra de som fortsatt ligger/er ventet, til `days`
 * dager fram. Et anløp er ferdig når avgangstiden er passert (eller 12 timer
 * etter ankomst hvis avgang mangler).
 */
export function currentCalls(calls, { now = Date.now(), days = 14, quayId = null } = {}) {
  const until = now + days * 86_400_000;
  return (calls || []).filter((c) => {
    if (quayId && c.quayId !== quayId) return false;
    // Ferdig: avgangen (slutten av dagen hvis bare dato), ellers 12 timer etter
    // ankomst – eller slutten av ankomstdagen når klokkeslettet ikke er kjent.
    const done = c.etd ? ms(c.etd, true) : hasClock(c.eta) ? ms(c.eta) + 12 * 3600_000 : ms(c.eta, true);
    return done >= now && ms(c.eta) <= until;
  });
}

/** Én varelinje: «↓ 1 200 tonn sement» */
export function cargoLine(g) {
  const dir = CARGO_DIRS.find((d) => d.value === g.dir)?.icon || '';
  const qty = g.qty != null ? `${g.qty.toLocaleString('nb-NO')}${g.unit ? ` ${g.unit}` : ''} ` : '';
  return `${dir} ${qty}${g.goods}`.trim();
}

/** «↓ 1 200 tonn sement · ↑ 40 paller fisk» */
export function cargoText(cargo) {
  return (cargo || []).map(cargoLine).join(' · ');
}

/** «tor 2 nov 14:30» / «i dag 14:30» / «i morgen» (uten klokkeslett når det ikke er kjent) */
export function callTimeText(t, now = Date.now()) {
  if (!t) return '–';
  const d = callDate(t);
  const clock = hasClock(t) ? d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '';
  const day = new Date(now);
  const tomorrow = new Date(now + 86_400_000);
  if (d.toDateString() === day.toDateString()) return `i dag ${clock}`.trim();
  if (d.toDateString() === tomorrow.toDateString()) return `i morgen ${clock}`.trim();
  return `${d.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')} ${clock}`.trim();
}
