import { useFeed, FeedMessage } from './useFeed.jsx';

// Kommende hendelser fra en publisert kalender (Google/Outlook .ics).

const dayKey = (iso) => new Date(iso).toLocaleDateString('sv-SE');
function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'I dag';
  if (d.toDateString() === tomorrow.toDateString()) return 'I morgen';
  return d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
}
const time = (iso) => new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });

export default function CalendarSlide({ slide, chromeless }) {
  const c = slide.config || {};
  const { data, error } = useFeed(slide.elementId, `${c.url}|${c.days}|${c.max}`, 10 * 60_000);
  const bare = chromeless && c.frame !== true;
  const style = { containerType: 'size', color: c.color || '#ffffff' };
  const events = data?.events || [];

  const groups = [];
  for (const ev of events) {
    const k = dayKey(ev.start);
    if (groups.at(-1)?.key !== k) groups.push({ key: k, label: dayLabel(ev.start), items: [] });
    groups.at(-1).items.push(ev);
  }

  return (
    <div className={`h-full w-full overflow-hidden ${bare ? '' : 'rounded-xl bg-black/30 p-[4%]'}`} style={style}>
      {!c.url ? (
        <FeedMessage>Lim inn kalenderens .ics-adresse</FeedMessage>
      ) : !data ? (
        <FeedMessage>{error || 'Henter kalender …'}</FeedMessage>
      ) : !events.length ? (
        <FeedMessage>Ingen kommende hendelser</FeedMessage>
      ) : (
        <div className="flex h-full flex-col gap-[3%]" style={{ fontSize: '5.2cqmin' }}>
          {groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-[0.35em]">
              <h3 className="m-0 text-[0.85em] font-bold capitalize opacity-70">{g.label}</h3>
              {g.items.map((ev, i) => (
                <div key={i} className="flex gap-[0.8em]">
                  <span className="w-[4.2em] shrink-0 font-semibold tabular-nums">{ev.allDay ? 'Hele dagen' : time(ev.start)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{ev.title}</span>
                    {c.showLocation !== false && ev.location && (
                      <span className="block truncate text-[0.8em] opacity-70">{ev.location}</span>
                    )}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
