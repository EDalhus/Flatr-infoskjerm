import { useEffect, useMemo, useState } from 'react';
import { isWithinDaypart } from '../lib/daypart.js';
import SlideCanvas from './SlideCanvas.jsx';

const ANIM = {
  none: null,
  fade: 'deckFade',
  dissolve: 'deckFade',
  'push-left': 'deckPushLeft',
  'push-up': 'deckPushUp'
};

export default function DeckPlayer({ deck, ctx }) {
  const now = ctx.now;
  const visible = deck.filter((s) => s.enabled !== 0 && isWithinDaypart(s, now));
  const key = visible.map((s) => s.id).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slides = useMemo(() => visible, [key]);

  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [key]);

  const count = slides.length;
  useEffect(() => {
    if (count < 2) return undefined;
    const cur = slides[index % count];
    const secs = Math.max(2, Number(cur?.duration_seconds) || 15);
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), secs * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, index, count]);

  const next = () => setIndex((i) => (count ? (i + 1) % count : 0));

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
  const anim = ANIM[cur.transition] ?? 'deckFade';

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div
        key={cur.id}
        className="absolute inset-0"
        style={anim ? { animation: `${anim} ${cur.transition_ms ?? 600}ms both ease` } : undefined}
      >
        <SlideCanvas slide={cur} ctx={ctx} onNext={next} />
      </div>
    </div>
  );
}
