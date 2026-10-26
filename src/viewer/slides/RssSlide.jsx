import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFeed, FeedMessage } from './useFeed.jsx';

// Nyheter fra RSS/Atom. mode: 'ticker' (rullende linje), 'list' (overskrifter),
// 'single' (én sak av gangen, roterer).

function Ticker({ items, speed, source }) {
  const trackRef = useRef(null);
  const [duration, setDuration] = useState(60);

  // Fart i piksler pr. sekund – uavhengig av hvor mange saker det er.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    const update = () => setDuration(Math.max(8, el.scrollWidth / 2 / Math.max(10, speed)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items, speed]);

  const line = items.map((it, i) => (
    <span key={i} className="inline-flex items-center">
      <span className="mx-[1.2em] opacity-50">•</span>
      {it.title}
    </span>
  ));

  return (
    <div className="flex h-full w-full items-center overflow-hidden" style={{ fontSize: '55cqh' }}>
      {source && (
        <span className="z-10 shrink-0 self-stretch bg-inherit px-[0.6em] font-bold" style={{ display: 'flex', alignItems: 'center' }}>
          {source}
        </span>
      )}
      <div className="min-w-0 flex-1 overflow-hidden">
        <div
          ref={trackRef}
          className="inline-flex whitespace-nowrap will-change-transform"
          style={{ animation: `tickerScroll ${duration}s linear infinite` }}
        >
          <span className="inline-flex">{line}</span>
          <span className="inline-flex" aria-hidden="true">
            {line}
          </span>
        </div>
      </div>
    </div>
  );
}

function Single({ items }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % Math.max(1, items.length)), 9000);
    return () => clearInterval(t);
  }, [items.length]);
  const it = items[i % Math.max(1, items.length)];
  if (!it) return null;
  return (
    <div key={i} className="flex h-full w-full animate-fade-in items-center gap-[4%]">
      {it.image && <img src={it.image} alt="" className="h-full max-w-[40%] rounded-lg object-cover" />}
      <div className="min-w-0">
        <div className="font-bold leading-tight" style={{ fontSize: '11cqmin' }}>
          {it.title}
        </div>
        {it.summary && (
          <div className="mt-[2%] line-clamp-3 opacity-80" style={{ fontSize: '6cqmin' }}>
            {it.summary}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RssSlide({ slide }) {
  const c = slide.config || {};
  const { data, error } = useFeed(slide.elementId, c.url, 10 * 60_000);
  const items = (data?.items || []).slice(0, Math.max(1, Number(c.max) || 10));
  const mode = c.mode || 'ticker';
  const style = { containerType: 'size', color: c.color || '#ffffff', background: c.background || 'transparent' };

  return (
    <div className="h-full w-full overflow-hidden" style={style}>
      {!items.length ? (
        <FeedMessage>{error || (c.url ? 'Henter nyheter …' : 'Legg inn en RSS-adresse')}</FeedMessage>
      ) : mode === 'ticker' ? (
        <Ticker items={items} speed={Number(c.speed) || 60} source={c.showSource !== false ? data.title?.split(/[-–|]/)[0].trim() : null} />
      ) : mode === 'single' ? (
        <div className="h-full w-full p-[3%]">
          <Single items={items} />
        </div>
      ) : (
        <ul className="m-0 flex h-full list-none flex-col justify-around p-[4%]" style={{ fontSize: `${Math.min(9, 70 / items.length)}cqh` }}>
          {items.map((it, i) => (
            <li key={i} className="truncate border-b border-current/10 py-[0.3em] font-semibold last:border-0">
              {it.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
