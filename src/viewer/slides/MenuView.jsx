import { FeedMessage } from './useFeed.jsx';
import { MENU_DAYS } from '../../lib/menu.js';

// Dagens meny / hele uka (Flatr-appen «Dagens meny»). Skriften følger flaten.

function Dish({ d, showPrice, showTags }) {
  return (
    <div className="flex items-baseline gap-[0.6em]">
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-tight">
          {d.name}
          {showTags && d.tags?.length > 0 && (
            <span className="ml-[0.4em] align-middle font-semibold opacity-60" style={{ fontSize: '0.6em', letterSpacing: '0.05em' }}>
              {d.tags.join(' · ')}
            </span>
          )}
        </div>
        {d.desc && <div className="leading-snug opacity-70" style={{ fontSize: '0.72em' }}>{d.desc}</div>}
      </div>
      {showPrice && d.price && <div className="shrink-0 font-bold tabular-nums">{d.price}</div>}
    </div>
  );
}

export default function MenuView({ data, view = 'today', title, showPrice = true, showTags = true }) {
  const week = data?.week || {};
  const today = data?.today || 1;
  if (view === 'week') {
    const days = MENU_DAYS.filter(([d]) => (week[d] || []).length);
    if (!days.length) return <FeedMessage>Ingen meny lagt inn</FeedMessage>;
    const lines = days.reduce((n, [d]) => n + 1.4 + week[d].length * 1.1, 0) + 1.6;
    return (
      <div className="flex h-full w-full flex-col" style={{ fontSize: `min(${(100 / lines / 1.35).toFixed(2)}cqh, 3cqw)` }}>
        <div className="mb-[0.5em] font-bold" style={{ fontSize: '1.3em' }}>{title || 'Ukens meny'}</div>
        <div className="grid min-h-0 flex-1 content-start gap-[0.6em]">
          {days.map(([d, name]) => (
            <div key={d} className={`rounded-[0.5em] px-[0.6em] py-[0.35em] ${d === today ? 'bg-white/15' : ''}`}>
              <div className="mb-[0.15em] font-bold uppercase opacity-70" style={{ fontSize: '0.65em', letterSpacing: '0.1em' }}>
                {name}
                {d === today && ' · i dag'}
              </div>
              <div className="grid gap-[0.2em]">
                {week[d].map((dish, i) => (
                  <Dish key={i} d={dish} showPrice={showPrice} showTags={showTags} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const dishes = week[today] || [];
  const dayName = MENU_DAYS.find(([d]) => d === today)?.[1];
  if (!dishes.length) return <FeedMessage>{`Ingen meny for ${dayName?.toLowerCase() || 'i dag'}`}</FeedMessage>;
  const rows = Math.max(3, dishes.reduce((n, d) => n + (d.desc ? 1.7 : 1.1), 0)) + 2.2;
  return (
    <div className="flex h-full w-full flex-col" style={{ fontSize: `min(${(100 / rows / 1.4).toFixed(2)}cqh, 4.2cqw)` }}>
      <div className="mb-[0.15em] font-bold uppercase opacity-70" style={{ fontSize: '0.6em', letterSpacing: '0.12em' }}>
        {dayName}
      </div>
      <div className="mb-[0.6em] font-bold" style={{ fontSize: '1.35em' }}>{title || 'Dagens meny'}</div>
      <div className="grid min-h-0 flex-1 content-start gap-[0.55em]">
        {dishes.map((d, i) => (
          <Dish key={i} d={d} showPrice={showPrice} showTags={showTags} />
        ))}
      </div>
      {data?.note && <div className="mt-[0.4em] opacity-60" style={{ fontSize: '0.6em' }}>{data.note}</div>}
    </div>
  );
}
