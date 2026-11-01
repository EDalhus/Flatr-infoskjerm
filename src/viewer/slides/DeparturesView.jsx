import { FeedMessage } from './useFeed.jsx';
import { departureText, upcoming, platformText } from '../../lib/entur.js';

// Avganger fra Entur (Flatr-appen «Avganger»): tavle for én holdeplass i
// sanntid. Tida regnes fra forventet avgang, så «5 min» teller ned mellom hver
// gang dataene hentes.

function LineBadge({ d }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[0.3em] px-[0.35em] font-extrabold tabular-nums leading-none"
      style={{ minWidth: '2.4em', height: '1.55em', background: d.color || 'rgba(255,255,255,0.18)', color: d.text_color || '#fff' }}
    >
      {d.line || '–'}
    </span>
  );
}

export default function DeparturesView({ data, stopId, modes, walkMinutes = 0, max = 8, showPlatform = true, title, now = Date.now() }) {
  const stops = data?.stops || [];
  if (!stops.length) return <FeedMessage>Legg til en holdeplass i Avganger</FeedMessage>;
  const stop = stops.find((s) => s.id === stopId) || stops[0];
  const tz = data?.tz || 'Europe/Oslo';
  const rows = upcoming(stop, { modes, walkMinutes, max }, now);
  const notice = rows.find((d) => d.notice)?.notice;
  const lines = Math.max(rows.length, 3) + (notice ? 1 : 0);

  return (
    <div className="flex h-full w-full flex-col" style={{ fontSize: `min(${(100 / (lines * 1.95 + 2.6)).toFixed(2)}cqh, 3.4cqw)` }}>
      <div className="mb-[0.45em] flex min-w-0 items-baseline gap-[0.6em]">
        <span className="min-w-0 truncate font-bold" style={{ fontSize: '1.25em' }}>
          {title || stop.name}
        </span>
        {Number(walkMinutes) > 0 && (
          <span className="shrink-0 opacity-60" style={{ fontSize: '0.72em' }}>
            {walkMinutes} min å gå
          </span>
        )}
        {data.stale && (
          <span className="ml-auto shrink-0 opacity-60" style={{ fontSize: '0.72em' }}>
            Ikke oppdatert
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="opacity-70">Ingen avganger den neste tiden</div>
      ) : (
        <div className="grid content-start gap-[0.3em]">
          {rows.map((d, i) => (
            <div
              key={`${d.line}-${d.aimed}-${i}`}
              className="grid items-center gap-[0.6em] rounded-[0.4em] px-[0.5em] py-[0.25em]"
              style={{ gridTemplateColumns: `auto minmax(0,1fr)${showPlatform ? ' auto' : ''} minmax(3.6em,auto)`, background: 'rgba(0,0,0,0.25)' }}
            >
              <LineBadge d={d} />
              <span className={`min-w-0 truncate font-semibold ${d.cancelled ? 'line-through opacity-60' : ''}`}>{d.destination}</span>
              {showPlatform && (
                <span className="opacity-60" style={{ fontSize: '0.75em' }}>
                  {platformText(d)}
                </span>
              )}
              <span className="text-right font-bold tabular-nums">
                {d.cancelled ? <span style={{ color: '#fca5a5' }}>Innstilt</span> : departureText(d.expected, now, tz)}
              </span>
            </div>
          ))}
        </div>
      )}
      {notice && (
        <div className="mt-[0.4em] truncate opacity-75" style={{ fontSize: '0.75em' }}>
          ⚠ {notice}
        </div>
      )}
    </div>
  );
}
