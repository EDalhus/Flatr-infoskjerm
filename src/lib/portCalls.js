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

/* ------------------- import fra tabell (Excel/CSV) uten AI ------------------- */

const COLS = {
  name: /^(båt|bat|skip|fartøy|fartoy|vessel|ship|navn)$/,
  mmsi: /^mmsi$/,
  quay: /^(kai|quay|berth|kaiplass)$/,
  date: /^(dato|date|ankomst|eta|ankomstdato|arrival)$/,
  time: /^(tid|klokke|kl|klokkeslett|time)$/,
  etd: /^(avgang|etd|departure|avgangsdato)$/,
  from: /^(fra|from|kommer fra|forrige havn)$/,
  next: /^(neste havn|neste|next|destinasjon|destination|til)$/,
  goods: /^(vare|varer|goods|cargo|last)$/,
  qty: /^(mengde|antall|qty|quantity|tonn)$/,
  unit: /^(enhet|unit)$/,
  dir: /^(retning|type|lasting\/lossing|operasjon)$/
};

/** «24.12», «24.12.2026», «2026-12-24» (+ evt. «14:30») -> "YYYY-MM-DD[THH:MM]". */
function parseWhen(dateStr, timeStr, today) {
  const s = String(dateStr || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2})[:.](\d{2}))?/.exec(s);
  let y, mo, d, hh, mm;
  if (m) [, y, mo, d, hh, mm] = m;
  else if ((m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?:\s+(?:kl\.?\s*)?(\d{1,2})[:.](\d{2}))?/.exec(s))) {
    [, d, mo, y, hh, mm] = m;
    if (!y) {
      const [ty, tm, td] = today.split('-').map(Number);
      y = Number(mo) < tm || (Number(mo) === tm && Number(d) < td) ? ty + 1 : ty;
    } else if (String(y).length === 2) y = `20${y}`;
  } else return null;
  const t = /^(\d{1,2})[:.](\d{2})$/.exec(String(timeStr || '').trim());
  if (t) [, hh, mm] = t;
  const date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return hh != null ? `${date}T${String(hh).padStart(2, '0')}:${mm}` : date;
}

/** Leser innlimt tabell med overskriftsrad (tab, semikolon eller komma). -> anløp (urensede). */
export function parseCallTable(text, { fleet = [], quays = [], today }) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(Object.entries(COLS).map(([k, re]) => [k, head.findIndex((h) => re.test(h))]));
  if (col.date < 0 || (col.name < 0 && col.mmsi < 0)) return [];
  const norm = (s) => String(s || '').toLowerCase().replace(/^(ms|mv|m\/s|m\/v)\s+/, '').trim();
  const out = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(sep).map((c) => c.trim());
    const get = (k) => (col[k] >= 0 ? cells[col[k]] || '' : '');
    const eta = parseWhen(get('date'), get('time'), today);
    if (!eta) continue;
    const boat = fleet.find((b) => (get('mmsi') && b.mmsi === get('mmsi')) || norm(b.name) === norm(get('name')));
    const quay = quays.find((q) => norm(q.name) === norm(get('quay')));
    const dirText = get('dir').toLowerCase();
    const cargo = get('goods')
      ? [{ dir: /last|load|henter|hent/.test(dirText) ? 'load' : 'unload', goods: get('goods'), qty: Number(get('qty').replace(/\s/g, '').replace(',', '.')) || null, unit: get('unit') || null }]
      : [];
    // Flere linjer for samme båt og ankomst = flere varer på samme anløp.
    const prev = out.find((c) => c.eta === eta && (c.mmsi || c.name) === (boat?.mmsi || get('name')));
    if (prev) {
      prev.cargo.push(...cargo);
      continue;
    }
    out.push({
      mmsi: boat?.mmsi || null,
      name: boat ? null : get('name') || null,
      quayId: quay?.id || null,
      eta,
      etd: get('etd') ? parseWhen(get('etd'), '', today) : null,
      from: get('from') || null,
      next: get('next') || null,
      cargo
    });
  }
  return out;
}
