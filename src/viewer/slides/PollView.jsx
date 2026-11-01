import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { FeedMessage } from './useFeed.jsx';

// Avstemning (Flatr-appen «Avstemning») på skjermen: spørsmålet, QR-koden folk
// skanner, og resultatene live (søyler) – eller spørsmål fra salen med flest
// hjerter øverst. `view = 'qr'` viser bare spørsmålet og QR-koden.

function Qr({ url, className }) {
  const src = useMemo(() => {
    try {
      const q = qrcode(0, 'M');
      q.addData(url);
      q.make();
      return q.createDataURL(8, 1);
    } catch {
      return '';
    }
  }, [url]);
  return src ? <img src={src} alt="" className={`rounded-[0.35em] bg-white p-[0.25em] ${className || ''}`} style={{ imageRendering: 'pixelated' }} /> : null;
}

/** Er boksen smal (høyere enn bred)? Da legges QR-koden under i stedet for ved siden av. */
function useNarrow() {
  const ref = useRef(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < el.clientHeight * 1.15));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, narrow];
}

export default function PollView(props) {
  const [ref, narrow] = useNarrow();
  return (
    <div ref={ref} className="h-full w-full">
      <PollContent {...props} narrow={narrow} />
    </div>
  );
}

function PollContent({ data, pollId, view = 'results', title, narrow }) {
  const polls = data?.polls || {};
  // Uten valgt avstemning: den nyeste som er åpen (ellers den nyeste).
  const newest = Object.values(polls).sort((a, b) => b.id - a.id);
  const poll = polls[pollId] || newest.find((p) => p.status === 'open') || newest[0];
  if (!poll) return <FeedMessage>Lag en avstemning i appen Avstemning</FeedMessage>;
  const origin = data.origin || (typeof window !== 'undefined' ? window.location.origin : '');
  const url = `${origin}${poll.path}`;
  const short = url.replace(/^https?:\/\//, '');
  const open = poll.status === 'open';
  const heading = title || poll.question;

  if (view === 'qr') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-[0.5em] text-center" style={{ fontSize: 'min(5cqh, 4.5cqw)' }}>
        <div className="max-w-full font-extrabold leading-tight" style={{ fontSize: '1.3em' }}>
          {heading}
        </div>
        <Qr url={url} className="min-h-0 flex-1" />
        <div className="opacity-75">{open ? `Skann og ${poll.kind === 'questions' ? 'still et spørsmål' : 'stem'} · ${short}` : 'Avstemningen er avsluttet'}</div>
      </div>
    );
  }

  const side = (
    <div
      className="flex shrink-0 flex-col items-center justify-center gap-[0.4em] text-center"
      style={narrow ? { height: '34%', width: '100%' } : { height: '100%', width: '30%' }}
    >
      <Qr url={url} className={narrow ? 'min-h-0 flex-1' : 'w-full'} />
      <div className="font-semibold leading-tight" style={{ fontSize: '0.75em' }}>
        {open ? (poll.kind === 'questions' ? 'Skann og still et spørsmål' : 'Skann og stem') : 'Avsluttet'}
      </div>
      <div className="max-w-full truncate opacity-60" style={{ fontSize: '0.55em' }}>
        {short}
      </div>
    </div>
  );

  if (poll.kind === 'questions') {
    const qs = (poll.questions || []).slice(0, 6);
    return (
      <div className={`flex h-full w-full gap-[0.8em] ${narrow ? 'flex-col' : ''}`} style={{ fontSize: narrow ? 'min(3.6cqh, 6.5cqw)' : 'min(5.2cqh, 3.4cqw)' }}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mb-[0.5em] font-extrabold leading-tight" style={{ fontSize: '1.2em' }}>
            {heading}
          </div>
          {qs.length ? (
            <div className="grid content-start gap-[0.35em]">
              {qs.map((q) => (
                <div key={q.id} className="flex items-start gap-[0.6em] rounded-[0.4em] px-[0.6em] py-[0.35em]" style={{ background: 'rgba(0,0,0,0.25)' }}>
                  <span className="min-w-0 flex-1 leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {q.text}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums" style={{ color: '#fda4af' }}>
                    ♥ {q.likes}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="opacity-70">Ingen spørsmål ennå – skann koden og still det første.</div>
          )}
        </div>
        {side}
      </div>
    );
  }

  const visible = poll.show_results || !open;
  const max = Math.max(1, ...(poll.counts || [0]));
  return (
    <div
      className={`flex h-full w-full gap-[0.8em] ${narrow ? 'flex-col' : ''}`}
      style={{ fontSize: `min(${(100 / (poll.options.length * 2.4 + 3) / (narrow ? 1.5 : 1)).toFixed(2)}cqh, ${narrow ? 6.5 : 3.4}cqw)` }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
        <div className="mb-[0.6em] font-extrabold leading-tight" style={{ fontSize: '1.35em' }}>
          {heading}
        </div>
        {visible ? (
          <div className="grid gap-[0.5em]">
            {poll.options.map((o, i) => {
              const n = poll.counts?.[i] || 0;
              const pct = poll.total ? Math.round((n / poll.total) * 100) : 0;
              const lead = n > 0 && n === max;
              return (
                <div key={i}>
                  <div className="mb-[0.15em] flex items-baseline justify-between gap-[0.5em]">
                    <span className={`min-w-0 truncate ${lead ? 'font-bold' : ''}`}>{o}</span>
                    <span className="shrink-0 font-bold tabular-nums">{pct} %</span>
                  </div>
                  <div className="overflow-hidden rounded-full" style={{ height: '0.55em', background: 'rgba(255,255,255,0.15)' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(n / max) * 100}%`, background: lead ? '#4ade9f' : 'rgba(255,255,255,0.65)' }} />
                  </div>
                </div>
              );
            })}
            <div className="opacity-60" style={{ fontSize: '0.7em' }}>
              {poll.total === 1 ? '1 stemme' : `${poll.total} stemmer`}
            </div>
          </div>
        ) : (
          <div className="opacity-75">
            {poll.total === 1 ? '1 har stemt' : `${poll.total} har stemt`} · resultatene kommer når avstemningen er ferdig
          </div>
        )}
      </div>
      {side}
    </div>
  );
}
