import { useCallback, useEffect, useState } from 'react';

/**
 * Roterer gjennom en liste slides. Hver slide vises i sitt eget
 * `duration_seconds` (fallback `fallbackSeconds`). `next()` hopper videre
 * (brukes bl.a. når en video er ferdig).
 */
export function useSlideshow(slides, fallbackSeconds = 15) {
  const [index, setIndex] = useState(0);
  const key = slides.map((s) => s.id).join(',');
  const durKey = slides.map((s) => s.duration_seconds).join(',');
  const count = slides.length;

  useEffect(() => {
    setIndex(0);
  }, [key]);

  const next = useCallback(() => {
    setIndex((i) => (count ? (i + 1) % count : 0));
  }, [count]);

  useEffect(() => {
    if (count < 2) return undefined;
    const current = slides[index % count];
    const seconds = Math.max(3, Number(current?.duration_seconds) || fallbackSeconds);
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), seconds * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, durKey, index, count, fallbackSeconds]);

  const safeIndex = count ? index % count : 0;
  return { slide: count ? slides[safeIndex] : null, index: safeIndex, count, next };
}
