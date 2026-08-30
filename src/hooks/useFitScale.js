import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Måler containeren og regner ut hvor mye et fast «design-lerret»
 * (baseW × baseH) må skaleres for å passe inni den. Brukes til at
 * Viewer alltid ser lik ut – på en 4K-TV og i en liten forhåndsvisning.
 */
export function useFitScale(baseWidth, baseHeight) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    let raf = 0;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setScale(Math.min(w / baseWidth, h / baseHeight));
      } else {
        raf = requestAnimationFrame(measure);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [baseWidth, baseHeight]);

  return { containerRef, scale };
}
