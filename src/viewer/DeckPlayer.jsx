import { useEffect, useMemo, useState } from 'react';
import { isWithinDaypart } from '../lib/daypart.js';
import { backgroundStyle } from '../lib/deck.js';
import SlideCanvas from './SlideCanvas.jsx';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

// Inngående lysbilde-animasjon pr. overgang.
const IN_ANIM = {
  none: null,
  fade: 'deckFadeIn',
  dissolve: 'deckFadeIn',
  'push-left': 'deckPushInLeft',
  'push-up': 'deckPushInUp'
};
// Utgående lysbilde-animasjon (fade lar det ligge stille under, ingen svart).
const OUT_ANIM = {
  none: null,
  fade: null,
  dissolve: 'deckFadeOut',
  'push-left': 'deckPushOutLeft',
  'push-up': 'deckPushOutUp'
};

export default function DeckPlayer({ deck, ctx }) {
  const now = ctx.now;
  const visible = deck.filter((s) => s.enabled !== 0 && isWithinDaypart(s, now));
  const key = visible.map((s) => s.id).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slides = useMemo(() => visible, [key]);

  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState(null); // { slide, transition, ms }

  useEffect(() => {
    setIndex(0);
    setPrev(null);
  }, [key]);

  const count = slides.length;

  const go = (nextIdx) => {
    if (count < 1 || nextIdx === index) return;
    const outgoing = slides[index % count];
    const incoming = slides[nextIdx % count];
    const tr = incoming?.transition || 'fade';
    setPrev(
      tr !== 'none' && outgoing && incoming && outgoing.id !== incoming.id
        ? { slide: outgoing, transition: tr, ms: incoming.transition_ms ?? 600 }
        : null
    );
    setIndex(nextIdx);
  };
  const next = () => go((index + 1) % Math.max(1, count));

  useEffect(() => {
    if (count < 2) return undefined;
    const cur = slides[index % count];
    const secs = Math.max(2, Number(cur?.duration_seconds) || 15);
    const t = setTimeout(() => go((index + 1) % count), secs * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, index, count]);

  useEffect(() => {
    if (!prev) return undefined;
    const t = setTimeout(() => setPrev(null), (prev.ms || 600) + 80);
    return () => clearTimeout(t);
  }, [prev]);

  if (count === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-paper p-16 text-center text-ink">
        <div className="text-5xl font-black">Ingen lysbilder</div>
        <p className="max-w-xl text-2xl text-muted">
          Legg til lysbilder for denne skjermen i admin → Skjermer.
        </p>
      </div>
    );
  }

  const cur = slides[index % count];
  const inAnim = IN_ANIM[cur.transition] ?? null;
  const outAnim = prev ? (OUT_ANIM[prev.transition] ?? null) : null;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={backgroundStyle(cur.background)}
    >
      {prev && (
        <div
          key={`p-${prev.slide.id}`}
          className="absolute inset-0"
          style={outAnim ? { animation: `${outAnim} ${prev.ms}ms both ${EASE}` } : undefined}
        >
          <SlideCanvas slide={prev.slide} ctx={ctx} />
        </div>
      )}
      <div
        key={cur.id}
        className="absolute inset-0"
        style={inAnim ? { animation: `${inAnim} ${cur.transition_ms ?? 600}ms both ${EASE}` } : undefined}
      >
        <SlideCanvas slide={cur} ctx={ctx} onNext={next} />
      </div>
    </div>
  );
}
