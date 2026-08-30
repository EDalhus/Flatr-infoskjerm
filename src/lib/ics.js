// Enkel iCalendar-generering for programposter (klientside, ingen backend).

const fmt = (d) =>
  new Date(d)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

const esc = (s = '') =>
  String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

function vevent(item) {
  const start = fmt(item.start_time);
  const end = item.end_time ? fmt(item.end_time) : fmt(new Date(new Date(item.start_time).getTime() + 3600_000));
  return [
    'BEGIN:VEVENT',
    `UID:flatr-${item.id}@infoskjerm`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${esc(item.title)}`,
    item.stage ? `LOCATION:${esc(item.stage)}` : null,
    item.description ? `DESCRIPTION:${esc(item.description)}` : null,
    'END:VEVENT'
  ]
    .filter(Boolean)
    .join('\r\n');
}

export function buildIcs(items, calName = 'Program') {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flatr Infoskjerm//NO',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(calName)}`,
    ...items.map(vevent),
    'END:VCALENDAR'
  ].join('\r\n');
}

export function downloadIcs(items, filename = 'program.ics', calName = 'Program') {
  const blob = new Blob([buildIcs(items, calName)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
