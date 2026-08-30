// Slide-typer og standardoppsett. `config` lagres som JSON pr. slide.

export const SLIDE_TYPES = [
  { value: 'program', label: 'Program', icon: 'calendar' },
  { value: 'sponsors', label: 'Sponsorer', icon: 'image' },
  { value: 'message', label: 'Melding', icon: 'megaphone' },
  { value: 'clock', label: 'Klokke', icon: 'clock' },
  { value: 'image', label: 'Bilde', icon: 'image' }
];

export const SLIDE_TYPE_LABEL = Object.fromEntries(SLIDE_TYPES.map((t) => [t.value, t.label]));
export const SLIDE_TYPE_ICON = Object.fromEntries(SLIDE_TYPES.map((t) => [t.value, t.icon]));

export const PROGRAM_MODES = [
  { value: 'agenda', label: 'Liste – kommende poster' },
  { value: 'nowNext', label: 'Nå & neste (stor)' },
  { value: 'next', label: 'Kun neste post' }
];

export const MESSAGE_EMPHASIS = [
  { value: 'info', label: 'Info (turkis)' },
  { value: 'success', label: 'OK (grønn)' },
  { value: 'warn', label: 'Viktig (rød)' }
];

export const DEFAULT_CONFIG = {
  program: { mode: 'agenda', categoryIds: [], max: 10, stage: '', showCategory: true },
  sponsors: { sponsorIds: [] },
  message: { text: '', emphasis: 'info' },
  clock: { showDate: true, showSeconds: true },
  image: { url: '', fit: 'contain', caption: '' }
};

export function defaultConfig(type) {
  return { ...(DEFAULT_CONFIG[type] || {}) };
}

/** Filtrerer programlista etter en program-slide sin config. */
export function filterSchedule(schedule, config = {}) {
  let items = schedule.filter((i) => (i.effective_status || i.status) !== 'cancelled');
  const cats = Array.isArray(config.categoryIds) ? config.categoryIds : [];
  if (cats.length) items = items.filter((i) => cats.includes(i.category_id));
  if (config.stage) items = items.filter((i) => i.stage === config.stage);
  return items;
}
