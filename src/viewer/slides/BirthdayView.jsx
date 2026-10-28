import { FeedMessage } from './useFeed.jsx';
import { daysText, dateText } from '../../lib/birthdays.js';

// Bursdager-appen: de neste bursdagene som et kort. items kommer ferdig
// sortert fra serveren (eller fra forhåndsvisningen i admin).

const initials = (name) =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

// Flere enn dette får ikke plass på et kort; resten vises som «+ 3 til».
const MAX_ROWS = 8;

/**
 * days = 1–7: alle med bursdag fra i dag og så mange dager fram.
 * Uten days (eldre elementer): de `count` neste, uansett hvor langt fram.
 */
/** Bursdagene fra i dag og `days` dager fram (1–7). */
export const inWindow = (items, days) => items.filter((b) => b.days <= Math.min(7, Math.max(1, days)));

export default function BirthdayView({ items = [], days = null, count = 3, title = 'Bursdager', valign = 'top' }) {
  const windowed = days != null ? inWindow(items, days) : items.slice(0, Math.max(1, count));
  const shown = windowed.slice(0, MAX_ROWS);
  const more = windowed.length - shown.length;
  if (!items.length) return <FeedMessage>Ingen bursdager lagt inn ennå</FeedMessage>;

  // Skriften følger flaten: én rad per bursdag + overskrift (minst tre rader høy).
  const rows = Math.max(3, shown.length + (more > 0 ? 0.6 : 0)) + 1.3;
  // Med færre enn tre rader blir det ledig plass: valign legger innholdet øverst, i midten eller nederst.
  const few = shown.length < 3;
  const justify = few ? { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[valign] || 'flex-start' : undefined;
  return (
    <div className="flex h-full w-full flex-col" style={{ justifyContent: justify, fontSize: `min(${(100 / rows / 2.6).toFixed(2)}cqh, 5.2cqw)` }}>
      {title && (
        <div className="mb-[0.5em] flex shrink-0 items-center gap-[0.45em] font-bold" style={{ fontSize: '1.15em' }}>
          <span aria-hidden="true">🎂</span>
          <span className="truncate pb-[0.05em]">{title}</span>
        </div>
      )}
      <div className={`flex min-h-0 flex-col gap-[0.45em] ${few && shown.length ? '' : 'flex-1'}`}>
        {!shown.length && (
          <div className="flex flex-1 items-center justify-center rounded-[0.6em] px-[0.75em] text-center opacity-75" style={{ background: 'rgba(0,0,0,0.2)' }}>
            {days === 1 ? 'Ingen bursdager i dag eller i morgen' : `Ingen bursdager de neste ${days} dagene`}
          </div>
        )}
        {shown.map((b, i) => {
          const today = b.days === 0;
          return (
            <div
              key={`${b.name}-${i}`}
              className="flex min-h-0 items-center gap-[0.7em] rounded-[0.6em] px-[0.75em]"
              style={{
                // Få bursdager: vanlig radhøyde (som med tre), ikke strukket over hele kortet.
                flex: few ? '0 0 2.6em' : '1 1 0',
                background: today ? 'linear-gradient(100deg, rgba(214,64,159,0.55), rgba(247,107,21,0.45))' : 'rgba(0,0,0,0.28)',
                boxShadow: today ? '0 0 0 0.08em rgba(255,255,255,0.35) inset' : undefined
              }}
            >
              <span
                className="grid shrink-0 place-items-center rounded-full font-bold"
                style={{ width: '2.1em', height: '2.1em', fontSize: '0.85em', background: today ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)' }}
              >
                {today ? '🎉' : initials(b.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate pb-[0.05em] font-semibold leading-tight">{b.name}</div>
                <div className="truncate opacity-75" style={{ fontSize: '0.72em' }}>
                  {dateText(b.next)}
                  {b.age != null && ` · fyller ${b.age}`}
                </div>
              </div>
              <div className="shrink-0 text-right font-bold tabular-nums" style={{ fontSize: today ? '1em' : '0.85em' }}>
                {today ? 'I dag!' : daysText(b.days)}
              </div>
            </div>
          );
        })}
        {more > 0 && (
          <div className="shrink-0 text-center opacity-75" style={{ fontSize: '0.72em' }}>
            + {more} til
          </div>
        )}
      </div>
    </div>
  );
}
