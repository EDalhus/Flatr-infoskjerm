import FleetMap from '../components/FleetMap.jsx';
import { FeedMessage } from './useFeed.jsx';

// Visningen for egne Flatr Apps (laget i appbyggeren). Får ferdig utplukkede
// felt fra serveren: items = [{ title, subtitle, value, image, lat, lon, cols }].
// Malene skalerer med flaten (container query-enheter), som de andre widgetene.

const fmt = (v) => {
  if (v == null || v === '') return '–';
  if (typeof v === 'number') return v.toLocaleString('nb-NO', { maximumFractionDigits: 2 });
  return String(v);
};

function Value({ items, display }) {
  const it = items[0];
  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-center">
      {(display.heading || it?.title) && (
        <div className="font-semibold opacity-80" style={{ fontSize: '8cqmin' }}>
          {display.heading || it.title}
        </div>
      )}
      <div className="font-bold leading-none tabular-nums" style={{ fontSize: '30cqmin' }}>
        {fmt(it?.value ?? it?.title)}
        {display.unit && <span style={{ fontSize: '0.45em' }}> {display.unit}</span>}
      </div>
      {it?.subtitle && (
        <div className="mt-[2%] opacity-70" style={{ fontSize: '6cqmin' }}>
          {it.subtitle}
        </div>
      )}
    </div>
  );
}

function Heading({ display }) {
  if (!display.heading) return null;
  return (
    <div className="mb-[0.4em] shrink-0 truncate pb-[0.05em] font-bold" style={{ fontSize: '1.3em' }}>
      {display.heading}
    </div>
  );
}

function List({ items, display }) {
  return (
    <div className="flex h-full w-full flex-col" style={{ fontSize: '5cqmin' }}>
      <Heading display={display} />
      <div className="flex min-h-0 flex-1 flex-col gap-[0.3em] overflow-hidden">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-[0.6em] rounded-[0.4em] px-[0.6em] py-[0.35em]" style={{ background: 'rgba(0,0,0,0.28)' }}>
            {it.image && <img src={it.image} alt="" className="h-[1.6em] w-[1.6em] shrink-0 rounded object-cover" />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{fmt(it.title)}</div>
              {it.subtitle && (
                <div className="truncate opacity-70" style={{ fontSize: '0.75em' }}>
                  {it.subtitle}
                </div>
              )}
            </div>
            {it.value != null && (
              <span className="shrink-0 font-bold tabular-nums">
                {fmt(it.value)}
                {display.unit ? ` ${display.unit}` : ''}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Cards({ items, display }) {
  const n = Math.max(1, items.length);
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  return (
    <div className="flex h-full w-full flex-col">
      <div style={{ fontSize: '5cqmin' }}>
        <Heading display={display} />
      </div>
      <div
        className="grid min-h-0 flex-1 gap-[2cqmin]"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          fontSize: `min(${(100 / cols / 14).toFixed(2)}cqw, ${(100 / rows / 9).toFixed(2)}cqh)`
        }}
      >
        {items.map((it, i) => (
          <div key={i} className="flex min-h-0 gap-[0.6em] overflow-hidden rounded-[0.6em] p-[0.8em]" style={{ background: 'rgba(0,0,0,0.32)' }}>
            {it.image && <img src={it.image} alt="" className="h-full max-h-[5em] w-[30%] shrink-0 rounded-[0.4em] object-cover" />}
            <div className="flex min-w-0 flex-1 flex-col gap-[0.25em]">
              <div className="truncate pb-[0.1em] font-bold leading-snug" style={{ fontSize: '1.25em' }}>
                {fmt(it.title)}
              </div>
              {it.subtitle && <div className="line-clamp-2 opacity-75">{it.subtitle}</div>}
              {it.value != null && (
                <div className="mt-auto font-bold tabular-nums" style={{ fontSize: '1.4em' }}>
                  {fmt(it.value)}
                  {display.unit ? ` ${display.unit}` : ''}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Table({ items, display }) {
  const labels = display.columns || [];
  return (
    <div className="flex h-full w-full flex-col" style={{ fontSize: '4.5cqmin' }}>
      <Heading display={display} />
      <table className="w-full table-fixed border-collapse">
        {labels.some(Boolean) && (
          <thead>
            <tr className="text-left opacity-60" style={{ fontSize: '0.8em' }}>
              {labels.map((l, i) => (
                <th key={i} className="truncate px-[0.5em] pb-[0.3em] font-semibold">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {items.map((it, r) => (
            <tr key={r} style={{ background: r % 2 ? 'transparent' : 'rgba(0,0,0,0.22)' }}>
              {it.cols.map((c, i) => (
                <td key={i} className={`truncate px-[0.5em] py-[0.3em] ${i === 0 ? 'font-semibold' : ''} ${typeof c === 'number' ? 'tabular-nums' : ''}`}>
                  {fmt(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Map({ items, color }) {
  const points = items
    .filter((it) => it.lat != null && it.lon != null)
    .map((it, i) => ({ mmsi: String(i), name: fmt(it.title), color: color || '#5b5bd6', lat: it.lat, lon: it.lon, sog: 0 }));
  if (!points.length) return <FeedMessage>Ingen punkter med posisjon</FeedMessage>;
  return <FleetMap vessels={points} labels area="fleet" attribution="© Kartverket" />;
}

export default function CustomAppView({ template, display = {}, items = [], color }) {
  if (!items.length) return <FeedMessage>Ingen data</FeedMessage>;
  if (template === 'value') return <Value items={items} display={display} />;
  if (template === 'cards') return <Cards items={items} display={display} />;
  if (template === 'table') return <Table items={items} display={display} />;
  if (template === 'map') return <Map items={items} color={color} />;
  return <List items={items} display={display} />;
}
