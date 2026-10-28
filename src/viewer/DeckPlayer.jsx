import { useEffect, useMemo, useRef, useState } from 'react';
import { isWithinDaypart } from '../lib/daypart.js';
import { backgroundStyle } from '../lib/deck.js';
import { clockPosition, serverNow } from '../lib/deckClock.js';
import { logPlay } from './playLog.js';
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

// Berøringsskjermer: et trykk eller sveip setter automatisk bytte på pause; etter
// IDLE_MS uten berøring går skjermen tilbake til første lysbilde og fortsetter.
const IDLE_MS = 45_000;

export default function DeckPlayer({ deck, ctx }) {
  const now = ctx.now;
  const visible = deck.filter((s) => s.enabled !== 0 && isWithinDaypart(s, now));
  const key = visible.map((s) => s.id).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slides = useMemo(() => visible, [key]);

  // Berøringsskjermer (knapper) styres av den som står foran; de andre følger
  // felles klokke, så flere skjermer med samme presentasjon bytter samtidig.
  const synced = !slides.some((s) => (s.elements || []).some((e) => e.kind === 'button'));
  const startIndex = () => (synced && slides.length > 1 ? clockPosition(slides).index : 0);

  const [index, setIndex] = useState(startIndex);
  const [prev, setPrev] = useState(null); // { slide, transition, ms }
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setIndex(startIndex());
    setPrev(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const count = slides.length;

  // Visningsloggen: hvert lysbilde meldes når det går av skjermen.
  const shown = useRef(null);
  const curSlide = slides[index % Math.max(1, count)];
  useEffect(() => {
    if (!curSlide) return undefined;
    shown.current = { slide: curSlide, at: Date.now() };
    return () => {
      const s = shown.current;
      if (s) logPlay({ playlistId: s.slide.playlist_id, slideId: s.slide.id }, s.at);
      shown.current = null;
    };
  }, [curSlide?.id, key]);

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
  const prevSlide = () => go((index - 1 + count) % Math.max(1, count));

  // Interaksjon (knapper, sveip): pause og nettside-visning, tilbake etter IDLE_MS.
  const [paused, setPaused] = useState(false);
  const [overlay, setOverlay] = useState(null);
  const idleTimer = useRef(null);
  const swipeX = useRef(null);
  const backToStart = useRef(null);
  backToStart.current = () => {
    setPaused(false);
    setOverlay(null);
    go(0);
  };
  const touch = () => {
    setPaused(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => backToStart.current(), IDLE_MS);
  };
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  const nav = {
    act: (c) => {
      touch();
      if (c.action === 'prev') prevSlide();
      else if (c.action === 'slide') {
        const i = slides.findIndex((s) => s.id === Number(c.slideId));
        if (i >= 0) go(i);
      } else if (c.action === 'url' && /^https?:\/\//.test(c.url || '')) setOverlay(c.url);
      else next();
    }
  };
  const playerCtx = { ...ctx, nav };

  useEffect(() => {
    if (count < 2 || paused) return undefined;
    if (!synced) {
      const cur = slides[index % count];
      const secs = Math.max(2, Number(cur?.duration_seconds) || 15);
      const t = setTimeout(() => go((index + 1) % count), secs * 1000);
      return () => clearTimeout(t);
    }
    // Står vi på feil lysbilde (f.eks. etter pause), hopp dit klokka sier.
    const pos = clockPosition(slides, serverNow());
    if (pos.index !== index % count) {
      go(pos.index);
      return undefined;
    }
    const t = setTimeout(() => {
      const next = clockPosition(slides, serverNow() + 50);
      if (next.index !== index % count) go(next.index);
      else setTick((n) => n + 1); // timeren gikk litt for tidlig – regn ut på nytt
    }, pos.remainingMs + 20);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, index, count, paused, tick]);

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
      style={{ ...backgroundStyle(cur.background), touchAction: 'pan-y' }}
      onPointerDown={(e) => {
        swipeX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        const dx = e.clientX - (swipeX.current ?? e.clientX);
        swipeX.current = null;
        if (Math.abs(dx) > 80 && count > 1) {
          touch();
          if (dx < 0) next();
          else prevSlide();
        }
      }}
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
        <SlideCanvas slide={cur} ctx={playerCtx} onNext={next} />
      </div>
      {overlay && (
        <div className="absolute inset-0 z-50 bg-white" onPointerDown={touch}>
          <iframe title="Nettside" src={overlay} className="h-full w-full border-0" />
          <button
            type="button"
            onClick={() => (setOverlay(null), touch())}
            className="absolute right-6 top-6 rounded-full bg-black/80 px-8 py-4 text-3xl font-bold text-white shadow-2xl"
          >
            ✕ Lukk
          </button>
        </div>
      )}
    </div>
  );
}
