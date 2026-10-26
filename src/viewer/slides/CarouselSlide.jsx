import { useEffect, useMemo, useState } from 'react';
import { useFeed } from './useFeed.jsx';

// Bildekarusell: roterer gjennom alle bildene i en mappe i mediebiblioteket.
// Skjermene får bildelista i config.images (se buildState); editoren henter
// den selv via /api/feeds, siden den ikke går gjennom buildState.

function shuffled(list, seed) {
  const a = [...list];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CarouselSlide({ slide, ctx }) {
  const c = slide.config || {};
  const inline = Array.isArray(c.images) ? c.images : null;
  const { data } = useFeed(inline ? null : slide.elementId, c.folder, 60_000);
  const images = useMemo(() => {
    const list = inline ?? data?.images ?? [];
    return c.shuffle ? shuffled(list, list.length) : list;
  }, [inline, data, c.shuffle]);
  const [i, setI] = useState(0);
  const secs = Math.max(2, Number(c.seconds) || 8);

  useEffect(() => {
    if (images.length < 2) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % images.length), secs * 1000);
    return () => clearInterval(t);
  }, [images.length, secs]);

  if (!c.folder || !images.length) {
    // På en skjerm (ctx.screenId) vises ingenting; i editoren en tydelig plassholder.
    if (ctx?.screenId) return null;
    return (
      <div
        className="grid h-full w-full place-items-center border-[6px] border-dashed border-white/50 bg-black/25 p-[6%] text-center font-semibold text-white"
        style={{ containerType: 'size' }}
      >
        <span style={{ fontSize: '7cqmin' }}>{c.folder ? `Mappen «${c.folder}» er tom` : 'Bildekarusell – velg en mappe'}</span>
      </div>
    );
  }

  const fit = c.fit === 'cover' ? 'object-cover' : 'object-contain';
  const current = i % images.length;
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ containerType: 'size' }}>
      {images.map((img, n) =>
        // Bare nåværende og neste bilde i DOM-en, så store mapper ikke laster alt.
        n === current || n === (current + 1) % images.length ? (
          <img
            key={img.url}
            src={img.url}
            alt=""
            className={`absolute inset-0 h-full w-full ${fit}`}
            style={{
              opacity: n === current ? 1 : 0,
              transition: c.transition === 'none' ? 'none' : 'opacity 0.8s ease'
            }}
          />
        ) : null
      )}
    </div>
  );
}
