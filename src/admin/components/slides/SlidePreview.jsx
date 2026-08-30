import { useFitScale } from '../../../hooks/useFitScale.js';
import SlideView from '../../../viewer/slides/SlideView.jsx';

// Samme design-lerret som Viewer bruker, med samme sone-padding (p-3 @ 1920).
const BASE_W = 1920;
const BASE_H = 1080;

/**
 * Live, skalert forhåndsvisning av én slide – rendrer den ekte
 * Viewer-komponenten. `children` legges oppå i lerret-koordinater
 * (brukt til drag-håndtak for fri-slide).
 */
export default function SlidePreview({ slide, ctx, children }) {
  const { containerRef, scale } = useFitScale(BASE_W, BASE_H);

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-paper"
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: BASE_W, height: BASE_H, transform: `scale(${scale})` }}
      >
        <div className="h-full w-full p-3">
          <SlideView slide={slide} ctx={ctx} />
        </div>
        {children}
      </div>
    </div>
  );
}
