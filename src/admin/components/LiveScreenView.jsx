import { BASE_SIZE } from '../../lib/deck.js';
import { useFitScale } from '../../hooks/useFitScale.js';

// Live-visning av hva som faktisk spilles på skjermen – embedder Viewer-en
// (/display/:id?preview=1, eller /preview/:playlistId for en spilleliste)
// og skalerer den ned til panelbredden.
export default function LiveScreenView({ screenId, playlistId, orientation = 'landscape' }) {
  const base = BASE_SIZE[orientation === 'portrait' ? 'portrait' : 'landscape'];
  const { containerRef, scale } = useFitScale(base.w, base.h);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-hair bg-black"
      style={{ aspectRatio: `${base.w} / ${base.h}` }}
    >
      <iframe
        title="Live-visning"
        loading="lazy"
        src={playlistId ? `/preview/${playlistId}` : `/display/${screenId}?preview=1`}
        tabIndex={-1}
        scrolling="no"
        className="absolute left-0 top-0 origin-top-left border-0"
        style={{ width: base.w, height: base.h, transform: `scale(${scale})` }}
      />
    </div>
  );
}
