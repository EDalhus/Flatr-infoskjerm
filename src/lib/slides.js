// Delte hjelpere for program-widgeten.

export const PROGRAM_MODES = [
  { value: 'agenda', label: 'Liste – kommende poster' },
  { value: 'nowNext', label: 'Nå & neste (stor)' },
  { value: 'next', label: 'Kun neste post' }
];

export const MESSAGE_EMPHASIS = [
  { value: 'none', label: 'Ingen' },
  { value: 'info', label: 'Info (turkis)' },
  { value: 'success', label: 'OK (grønn)' },
  { value: 'warn', label: 'Viktig (rød)' }
];

/** Filtrerer programlista etter en program-widget sin config. */
export function filterSchedule(schedule, config = {}) {
  let items = schedule.filter((i) => (i.effective_status || i.status) !== 'cancelled');
  const cats = Array.isArray(config.categoryIds) ? config.categoryIds : [];
  if (cats.length) items = items.filter((i) => cats.includes(i.category_id));
  if (config.stage) items = items.filter((i) => i.stage === config.stage);
  return items;
}
