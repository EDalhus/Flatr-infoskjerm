import ProgramSlide from './ProgramSlide.jsx';
import SponsorSlide from './SponsorSlide.jsx';
import MessageSlide from './MessageSlide.jsx';
import ClockSlide from './ClockSlide.jsx';
import ImageSlide from './ImageSlide.jsx';

const RENDERERS = {
  program: ProgramSlide,
  sponsors: SponsorSlide,
  message: MessageSlide,
  clock: ClockSlide,
  image: ImageSlide
};

export default function SlideView({ slide, ctx }) {
  const Renderer = RENDERERS[slide.type];
  if (!Renderer) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-hair bg-card text-muted shadow-card">
        Ukjent slide-type: {slide.type}
      </div>
    );
  }
  return <Renderer slide={slide} ctx={ctx} />;
}
