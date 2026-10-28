// Dagens meny (Flatr App): ukemeny per ukedag med retter, pris og merking
// (allergener / vegetar). Felles for server og nettleser.

export const MENU_DAYS = [
  [1, 'Mandag'],
  [2, 'Tirsdag'],
  [3, 'Onsdag'],
  [4, 'Torsdag'],
  [5, 'Fredag'],
  [6, 'Lørdag'],
  [7, 'Søndag']
];

const str = (v, max) => String(v ?? '').trim().slice(0, max);

/** { week: { 1: [{ name, desc, price, tags: [] }], … }, note } */
export function cleanMenu(c) {
  const week = {};
  for (const [d] of MENU_DAYS) {
    const list = Array.isArray(c?.week?.[d]) ? c.week[d] : [];
    week[d] = list
      .map((it) => ({
        name: str(it?.name, 80),
        desc: str(it?.desc, 160) || null,
        price: str(it?.price, 20) || null,
        tags: (Array.isArray(it?.tags) ? it.tags : String(it?.tags || '').split(','))
          .map((t) => str(t, 20))
          .filter(Boolean)
          .slice(0, 8)
      }))
      .filter((it) => it.name)
      .slice(0, 12);
  }
  return { week, note: str(c?.note, 200) || null, weekend: c?.weekend === true };
}

/** Ukedag 1–7 (mandag = 1) for en dato i en tidssone. */
export function weekdayIn(tz, date = new Date()) {
  const wd = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Europe/Oslo', weekday: 'short' }).format(date);
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[wd];
}
