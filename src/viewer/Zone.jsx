import { useSlideshow } from '../hooks/useSlideshow.js';
import SlideView from './slides/SlideView.jsx';

export default function Zone({ slides, rotationSeconds, ctx }) {
  const active = slides.filter((s) => s.enabled !== 0);
  const { slide, index, count } = useSlideshow(active, rotationSeconds);

  if (!slide) {
    return <div className="h-full w-full rounded-2xl border border-dashed border-line" />;
  }

  return (
    <div className="relative h-full w-full">
      <div key={slide.id} className="h-full w-full animate-fade-in">
        <SlideView slide={slide} ctx={ctx} />
      </div>
      {count > 1 && (
        <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
          {Array.from({ length: count }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-brand' : 'bg-brand/25'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
