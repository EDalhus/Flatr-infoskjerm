const NB = 'nb-NO';

export function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(NB, { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(value) {
  const d = value ? new Date(value) : new Date();
  return d.toLocaleDateString(NB, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

/** Konverterer <input type="datetime-local"> til ISO (UTC). */
export function localInputToIso(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Konverterer ISO til verdi for <input type="datetime-local"> (lokal tid). */
export function isoToLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

const ms = (v) => new Date(v).getTime();

/**
 * Deler programmet inn i «nå på scenen» og «neste ut» ut fra klokka.
 */
export function partitionSchedule(items, now = new Date()) {
  const t = now.getTime();
  const active = (i) => i.status !== 'cancelled' && i.status !== 'done';

  const sorted = [...items]
    .filter((i) => i.start_time && !Number.isNaN(ms(i.start_time)))
    .sort((a, b) => ms(a.start_time) - ms(b.start_time));

  const current = sorted.filter((i) => {
    if (!active(i)) return false;
    const start = ms(i.start_time);
    const end = i.end_time && !Number.isNaN(ms(i.end_time)) ? ms(i.end_time) : start + 3600_000;
    return start <= t && t < end;
  });

  const upcoming = sorted.filter((i) => active(i) && ms(i.start_time) > t);

  return {
    sorted,
    current,
    upcoming,
    nowItem: current[0] ?? null,
    nextItem: upcoming[0] ?? null
  };
}

export function minutesUntil(value, now = new Date()) {
  return Math.round((ms(value) - now.getTime()) / 60000);
}
