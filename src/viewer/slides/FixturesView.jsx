import { FeedMessage } from './useFeed.jsx';
import { shortTeam, fixtureTime, untilText } from '../../lib/fixtures.js';

// Kampprogram (Flatr-appen, kalendere fra fotball.no og handball.no):
//  - list: neste kamper for de valgte lagene
//  - next: stor visning av neste kamp (eller neste hjemmekamp)

function Side({ side }) {
  if (!side) return null;
  const home = side === 'home';
  return (
    <span
      className="shrink-0 rounded-[0.3em] px-[0.4em] py-[0.05em] font-bold uppercase tracking-wide"
      style={{ fontSize: '0.62em', background: home ? 'rgba(74,222,159,0.25)' : 'rgba(255,255,255,0.14)', color: home ? '#86efac' : 'inherit' }}
    >
      {home ? 'Hjemme' : 'Borte'}
    </span>
  );
}

/** «Odd – Molde», med vårt lag uthevet. */
function Teams({ f }) {
  return (
    <span className="min-w-0 truncate">
      <span className={f.side === 'home' ? 'font-extrabold' : 'font-semibold opacity-85'}>{shortTeam(f.home)}</span>
      {f.away && (
        <>
          <span className="opacity-50"> – </span>
          <span className={f.side === 'away' ? 'font-extrabold' : 'font-semibold opacity-85'}>{shortTeam(f.away)}</span>
        </>
      )}
    </span>
  );
}

export default function FixturesView({ data, view = 'list', teams, homeOnly = false, max = 6, title, now = Date.now() }) {
  const tz = data?.tz || 'Europe/Oslo';
  const chosen = Array.isArray(teams) && teams.length ? new Set(teams) : null;
  const list = (data?.fixtures || []).filter(
    (f) => (!chosen || chosen.has(f.team)) && (!homeOnly || f.side === 'home') && Date.parse(f.start) + 2 * 3600_000 > now
  );
  if (!(data?.teams || []).length) return <FeedMessage>Legg til et lag i Kampprogram</FeedMessage>;
  if (!list.length) return <FeedMessage>{homeOnly ? 'Ingen hjemmekamper de neste månedene' : 'Ingen kamper de neste månedene'}</FeedMessage>;
  const manyTeams = new Set(list.map((f) => f.team)).size > 1;

  if (view === 'next') {
    const f = list[0];
    return (
      <div className="flex h-full w-full flex-col justify-center text-center" style={{ fontSize: 'min(6.5cqh, 4.6cqw)' }}>
        <div className="font-semibold uppercase tracking-[0.18em] opacity-70" style={{ fontSize: '0.6em' }}>
          {title || (homeOnly ? 'Neste hjemmekamp' : 'Neste kamp')}
          {manyTeams ? ` · ${f.team_name}` : ''}
        </div>
        <div className="mt-[0.5em] grid items-center gap-[0.6em]" style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', fontSize: '1.5em' }}>
          <span className={`truncate text-right ${f.side === 'home' ? 'font-extrabold' : 'font-semibold opacity-90'}`}>{shortTeam(f.home)}</span>
          <span className="opacity-50">–</span>
          <span className={`truncate text-left ${f.side === 'away' ? 'font-extrabold' : 'font-semibold opacity-90'}`}>{shortTeam(f.away) || '?'}</span>
        </div>
        <div className="mt-[0.6em] font-bold tabular-nums">{fixtureTime(f.start, tz, now)}</div>
        <div className="mt-[0.2em] truncate opacity-75" style={{ fontSize: '0.75em' }}>
          {[f.venue, f.competition].filter(Boolean).join(' · ')}
        </div>
        <div className="mt-[0.8em] inline-flex items-center justify-center gap-[0.5em]" style={{ fontSize: '0.7em' }}>
          <Side side={f.side} />
          <span className="font-semibold opacity-80">{untilText(f.start, now)}</span>
        </div>
      </div>
    );
  }

  const rows = list.slice(0, Math.max(1, Number(max) || 6));
  return (
    <div className="flex h-full w-full flex-col" style={{ fontSize: `min(${(100 / (rows.length * 2.15 + 2.4)).toFixed(2)}cqh, 3.3cqw)` }}>
      <div className="mb-[0.5em] truncate font-bold" style={{ fontSize: '1.25em' }}>
        {title || (homeOnly ? 'Neste hjemmekamper' : 'Neste kamper')}
      </div>
      <div className="grid content-start gap-[0.35em]">
        {rows.map((f, i) => (
          <div key={`${f.team}-${f.start}-${i}`} className="grid items-center gap-[0.7em] rounded-[0.4em] px-[0.6em] py-[0.35em]" style={{ gridTemplateColumns: '7.6em minmax(0,1fr)', background: 'rgba(0,0,0,0.25)' }}>
            <span className="font-bold tabular-nums" style={{ fontSize: '0.85em' }}>
              {fixtureTime(f.start, tz, now)}
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-[0.5em]">
                <Teams f={f} />
                <Side side={f.side} />
              </span>
              <span className="block truncate opacity-65" style={{ fontSize: '0.72em' }}>
                {[manyTeams ? f.team_name : null, f.venue, f.competition].filter(Boolean).join(' · ')}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
