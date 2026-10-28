import { FeedMessage } from './useFeed.jsx';

// Tidevann (Kartverket) og sjø (MET) for ett sted (Flatr-appen «Tidevann og sjø»).

const clock = (iso) => new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
const day = (iso, now) => {
  const d = new Date(iso);
  if (d.toDateString() === new Date(now).toDateString()) return '';
  if (d.toDateString() === new Date(now + 86_400_000).toDateString()) return 'i morgen ';
  return `${d.toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', '')} `;
};
const DIRS = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];
const dir = (deg) => (deg == null ? '' : DIRS[Math.round(deg / 45) % 8]);

export default function TidesView({ place, view = 'both', title, now = Date.now() }) {
  if (!place) return <FeedMessage>Velg et sted</FeedMessage>;
  if (place.error) return <FeedMessage>{place.error}</FeedMessage>;
  const events = (place.tides?.events || []).filter((e) => Date.parse(e.time) > now - 30 * 60_000).slice(0, 4);
  const sea = place.sea?.now;
  const showTides = view !== 'sea' && events.length > 0;
  const showSea = view !== 'tide' && sea;
  // Stiger eller synker vannet nå? Neste hendelse avgjør.
  const rising = events[0]?.kind === 'high';
  return (
    <div className="flex h-full w-full flex-col" style={{ fontSize: 'min(7cqh, 4.6cqw)' }}>
      <div className="mb-[0.5em] flex items-baseline gap-[0.5em]">
        <span className="font-bold" style={{ fontSize: '1.2em' }}>{title || place.name}</span>
        {showTides && <span className="opacity-60" style={{ fontSize: '0.7em' }}>{rising ? '↗ Stigende' : '↘ Synkende'}</span>}
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-[0.6em]" style={{ gridTemplateColumns: showTides && showSea ? 'minmax(0,1.3fr) minmax(0,1fr)' : '1fr' }}>
        {showTides && (
          <div className="grid content-start gap-[0.35em]">
            {events.map((e) => (
              <div key={e.time} className="flex items-baseline gap-[0.5em] rounded-[0.4em] px-[0.5em] py-[0.25em]" style={{ background: 'rgba(0,0,0,0.25)' }}>
                <span className="w-[2.6em] font-semibold opacity-80" style={{ fontSize: '0.75em' }}>
                  {e.kind === 'high' ? 'Flo' : 'Fjære'}
                </span>
                <span className="flex-1 font-bold tabular-nums">
                  <span className="font-normal opacity-60" style={{ fontSize: '0.7em' }}>
                    {day(e.time, now)}
                  </span>
                  {clock(e.time)}
                </span>
                <span className="tabular-nums opacity-70" style={{ fontSize: '0.75em' }}>{e.level} cm</span>
              </div>
            ))}
          </div>
        )}
        {showSea && (
          <div className="grid content-start gap-[0.35em]">
            {sea.wave != null && (
              <div>
                <div className="opacity-60" style={{ fontSize: '0.65em' }}>Bølger</div>
                <div className="font-bold tabular-nums">
                  {sea.wave.toFixed(1).replace('.', ',')} m <span className="font-normal opacity-60" style={{ fontSize: '0.65em' }}>fra {dir(sea.waveFrom)}</span>
                </div>
              </div>
            )}
            {sea.temp != null && (
              <div>
                <div className="opacity-60" style={{ fontSize: '0.65em' }}>Sjøtemperatur</div>
                <div className="font-bold tabular-nums">{sea.temp.toFixed(1).replace('.', ',')}°</div>
              </div>
            )}
            {sea.current != null && (
              <div>
                <div className="opacity-60" style={{ fontSize: '0.65em' }}>Strøm</div>
                <div className="font-bold tabular-nums">{(sea.current * 1.944).toFixed(1).replace('.', ',')} kn</div>
              </div>
            )}
          </div>
        )}
        {!showTides && !showSea && <FeedMessage>Ingen data for stedet</FeedMessage>}
      </div>
      <div className="mt-[0.3em] opacity-40" style={{ fontSize: '0.45em' }}>Kartverket · MET Norway</div>
    </div>
  );
}
