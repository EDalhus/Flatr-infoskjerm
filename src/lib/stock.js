// Lagerbeholdning (Flatr App): varer med mengde og enhet som legges inn for
// hånd, valgfrie detaljlinjer (f.eks. per silo) og en minstebeholdning som
// gir varsel på skjermen. Felles for server, admin og visning.

const str = (v, max) => String(v ?? '').trim().slice(0, max);

/** Faste grupper, vist hver for seg på skjermen. Paller har i tillegg palletype. */
export const STOCK_GROUPS = [
  { id: 'bulk', label: 'Bulk', unit: 'tonn' },
  { id: 'bigbags', label: 'Big bags', unit: 'big bags' },
  { id: 'pallets', label: 'Paller', unit: 'paller' }
];
export const PALLET_TYPES = [
  { id: 'EP', label: 'EP', name: 'Europalle' },
  { id: 'SRS', label: 'SRS', name: 'SRS-palle' }
];
const GROUP_IDS = STOCK_GROUPS.map((g) => g.id);

/** { title, location, items: [{ id, group, pallet, name, amount, unit, details: [], min }], updated_at } */
export function cleanStock(c) {
  return {
    title: str(c?.title, 60) || null,
    location: str(c?.location, 60) || null,
    items: (Array.isArray(c?.items) ? c.items : [])
      .map((it) => ({
        id: str(it?.id, 20) || Math.random().toString(36).slice(2, 10),
        // Varer fra før gruppene fantes, er bulk.
        group: GROUP_IDS.includes(it?.group) ? it.group : 'bulk',
        pallet: it?.group === 'pallets' ? (it?.pallet === 'SRS' ? 'SRS' : 'EP') : null,
        name: str(it?.name, 80),
        amount: str(it?.amount, 24),
        unit: str(it?.unit, 24),
        details: (Array.isArray(it?.details) ? it.details : String(it?.details || '').split('\n'))
          .map((d) => str(d, 80))
          .filter(Boolean)
          .slice(0, 6),
        min: str(it?.min, 24) || null
      }))
      .filter((it) => it.name)
      .slice(0, 60),
    updated_at: str(c?.updated_at, 40) || null
  };
}

/** "1052,44" / "1 052.44" -> 1052.44, ellers null (fritekst som «ca. 200»). */
export function parseAmount(v) {
  const s = String(v ?? '').replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Tall med norske mellomrom og komma ("1 052,44"); fritekst vises som den er. */
export function formatAmount(v) {
  const n = parseAmount(v);
  if (n == null) return String(v ?? '');
  return n.toLocaleString('nb-NO', { maximumFractionDigits: 2 });
}

/** Under minstebeholdningen (begge må være tall). */
export function isLow(item) {
  const a = parseAmount(item?.amount);
  const m = parseAmount(item?.min);
  return a != null && m != null && a < m;
}

/** Sum for en gruppe når alle varene har tall og samme enhet, ellers null. */
export function groupTotal(items) {
  if (items.length < 2) return null;
  const unit = items[0].unit;
  let sum = 0;
  for (const it of items) {
    const n = parseAmount(it.amount);
    if (n == null || it.unit !== unit) return null;
    sum += n;
  }
  return { amount: String(sum), unit };
}
