// Tidsstyring: avgjør om en slide skal vises akkurat nå.
// Felt (alle valgfrie): active_from/active_to "HH:MM", active_days "1,2,..7"
// (1=man … 7=søn), active_from_date/active_to_date "YYYY-MM-DD".

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function hasDaypart(s) {
  return !!(
    s &&
    (s.active_from || s.active_to || s.active_days || s.active_from_date || s.active_to_date)
  );
}

export function isWithinDaypart(s, now = new Date()) {
  if (!hasDaypart(s)) return true;

  // Datointervall
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  if (s.active_from_date && ymd < s.active_from_date) return false;
  if (s.active_to_date && ymd > s.active_to_date) return false;

  // Ukedag (JS: 0=søn..6=lør  →  1=man..7=søn)
  if (s.active_days) {
    const dow = now.getDay() === 0 ? 7 : now.getDay();
    const allowed = String(s.active_days)
      .split(',')
      .map((x) => Number(x.trim()))
      .filter(Boolean);
    if (allowed.length && !allowed.includes(dow)) return false;
  }

  // Klokkeslett-vindu (støtter vindu som krysser midnatt)
  const from = toMinutes(s.active_from);
  const to = toMinutes(s.active_to);
  if (from == null && to == null) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  const lo = from ?? 0;
  const hi = to ?? 24 * 60;
  return lo <= hi ? cur >= lo && cur < hi : cur >= lo || cur < hi;
}

export const WEEKDAYS = [
  { n: 1, label: 'Ma' },
  { n: 2, label: 'Ti' },
  { n: 3, label: 'On' },
  { n: 4, label: 'To' },
  { n: 5, label: 'Fr' },
  { n: 6, label: 'Lø' },
  { n: 7, label: 'Sø' }
];
