import { FeedMessage } from './useFeed.jsx';

// Fotball (Flatr-appen, data fra API-Football): neste kamper, siste resultater eller tabell.

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);
const when = (iso) => {
  const d = new Date(iso);
  const clock = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `I dag ${clock}`;
  return `${d.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')} ${clock}`;
};

function Logo({ src }) {
  return src ? <img src={src} alt="" className="h-[1.2em] w-[1.2em] shrink-0 object-contain" /> : <span className="h-[1.2em] w-[1.2em] shrink-0" />;
}

function Match({ f, result }) {
  const live = LIVE.has(f.status);
  return (
    <div className="grid items-center gap-[0.5em] rounded-[0.4em] px-[0.6em] py-[0.35em]" style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', background: live ? 'rgba(220,38,38,0.25)' : 'rgba(0,0,0,0.25)' }}>
      <div className="flex min-w-0 items-center justify-end gap-[0.4em] text-right">
        <span className="truncate font-semibold">{f.home.name}</span>
        <Logo src={f.home.logo} />
      </div>
      <div className="min-w-[4.2em] text-center font-bold tabular-nums">
        {result || live ? `${f.goals.home ?? 0} – ${f.goals.away ?? 0}` : <span style={{ fontSize: '0.7em' }}>{when(f.date)}</span>}
        {live && <div className="font-semibold text-red-300" style={{ fontSize: '0.55em' }}>LIVE {f.elapsed ? `${f.elapsed}'` : ''}</div>}
      </div>
      <div className="flex min-w-0 items-center gap-[0.4em]">
        <Logo src={f.away.logo} />
        <span className="truncate font-semibold">{f.away.name}</span>
      </div>
    </div>
  );
}

export default function FootballView({ data, view = 'next', teamId, leagueId, title, max = 5 }) {
  if (view === 'table') {
    const t = data?.tables?.[leagueId] || Object.values(data?.tables || {})[0];
    if (!t) return <FeedMessage>Velg en liga i appen</FeedMessage>;
    const rows = t.rows.slice(0, Math.max(4, Number(max) || 16));
    return (
      <div className="flex h-full w-full flex-col" style={{ fontSize: `min(${(100 / (rows.length + 2.5) / 1.25).toFixed(2)}cqh, 3.2cqw)` }}>
        <div className="mb-[0.4em] font-bold" style={{ fontSize: '1.25em' }}>{title || t.name}</div>
        <div className="grid content-start gap-[0.12em]">
          {rows.map((r) => (
            <div key={r.rank} className="grid items-center gap-[0.5em] px-[0.3em]" style={{ gridTemplateColumns: '1.6em 1.2em minmax(0,1fr) 2em 2.4em 2.2em' }}>
              <span className="text-right tabular-nums opacity-60">{r.rank}</span>
              <Logo src={r.logo} />
              <span className="truncate font-semibold">{r.team}</span>
              <span className="text-right tabular-nums opacity-60">{r.played}</span>
              <span className="text-right tabular-nums opacity-60">{r.gd > 0 ? `+${r.gd}` : r.gd}</span>
              <span className="text-right font-bold tabular-nums">{r.points}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const team = data?.teams?.[teamId] || Object.values(data?.teams || {})[0];
  if (!team) return <FeedMessage>Velg et lag i appen</FeedMessage>;
  const list = (view === 'last' ? team.last : team.next).slice(0, Number(max) || 5);
  if (!list.length) return <FeedMessage>{view === 'last' ? 'Ingen resultater ennå' : 'Ingen kommende kamper'}</FeedMessage>;
  return (
    <div className="flex h-full w-full flex-col" style={{ fontSize: `min(${(100 / (list.length * 1.9 + 2.2)).toFixed(2)}cqh, 3.4cqw)` }}>
      <div className="mb-[0.5em] flex items-center gap-[0.5em] font-bold" style={{ fontSize: '1.25em' }}>
        <Logo src={team.logo} />
        <span className="truncate">{title || `${team.name} – ${view === 'last' ? 'siste resultater' : 'neste kamper'}`}</span>
      </div>
      <div className="grid content-start gap-[0.35em]">
        {list.map((f) => (
          <Match key={f.id} f={f} result={view === 'last'} />
        ))}
      </div>
    </div>
  );
}
