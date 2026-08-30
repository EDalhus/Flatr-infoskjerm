import { useEffect, useState } from 'react';

/**
 * Roterer gjennom en liste slides. Hver slide vises i sitt eget
 * `duration_seconds` (fallback `fallbackSeconds`).
 */
export function useSlideshow(slides, fallbackSeconds = 15) {
  const [index, setIndex] = useState(0);
  const key = slides.map((s) => s.id).join(',');

  useEffect(() => {
    setIndex(0);
  }, [key]);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const current = slides[index % slides.length];
    const seconds = Math.max(3, Number(current?.duration_seconds) || fallbackSeconds);
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % slides.length),
      seconds * 1000
    );
    return () => clearTimeout(timer);
  }, [slides, index, fallbackSeconds]);

  const safeIndex = slides.length ? index % slides.length : 0;
  return { slide: slides.length ? slides[safeIndex] : null, index: safeIndex, count: slides.length };
}
