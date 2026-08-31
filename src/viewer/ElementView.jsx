import ClockSlide from './slides/ClockSlide.jsx';
import CountdownSlide from './slides/CountdownSlide.jsx';
import ProgramSlide from './slides/ProgramSlide.jsx';
import QrSlide from './slides/QrSlide.jsx';
import VideoSlide from './slides/VideoSlide.jsx';
import WebSlide from './slides/WebSlide.jsx';
import SponsorSlide from './slides/SponsorSlide.jsx';

function TextEl({ config }) {
  const c = config || {};
  const alignItems =
    c.valign === 'middle' ? 'center' : c.valign === 'bottom' ? 'flex-end' : 'flex-start';
  return (
    <div className="flex h-full w-full" style={{ alignItems }}>
      <div
        className="w-full whitespace-pre-wrap break-words"
        style={{
          fontSize: c.size ?? 64,
          fontWeight: c.weight ?? 700,
          fontStyle: c.italic ? 'italic' : 'normal',
          textAlign: c.align || 'left',
          lineHeight: c.lineHeight ?? 1.1,
          color: c.color || '#ffffff'
        }}
      >
        {c.text ?? ''}
      </div>
    </div>
  );
}

function ImageEl({ config }) {
  const c = config || {};
  if (!c.url) {
    return (
      <div className="grid h-full w-full place-items-center rounded bg-white/10 text-sm text-white/50">
        Bilde
      </div>
    );
  }
  return (
    <img
      src={c.url}
      alt=""
      className={`h-full w-full ${c.fit === 'cover' ? 'object-cover' : 'object-contain'}`}
      style={{ borderRadius: c.radius || 0 }}
    />
  );
}

function ShapeEl({ config }) {
  const c = config || {};
  const style = { background: c.fill || '#1f5566', opacity: (c.opacity ?? 100) / 100 };
  if (c.shape === 'ellipse') style.borderRadius = '50%';
  else if (c.shape === 'triangle') style.clipPath = 'polygon(50% 0, 100% 100%, 0 100%)';
  else style.borderRadius = c.radius ?? 0;
  return <div className="h-full w-full" style={style} />;
}

const WIDGET = {
  clock: ClockSlide,
  countdown: CountdownSlide,
  program: ProgramSlide,
  qr: QrSlide,
  video: VideoSlide,
  web: WebSlide,
  sponsors: SponsorSlide
};

export default function ElementView({ element, ctx, onNext }) {
  const { kind, config } = element;
  if (kind === 'text') return <TextEl config={config} />;
  if (kind === 'image') return <ImageEl config={config} />;
  if (kind === 'shape') return <ShapeEl config={config} />;
  const W = WIDGET[kind];
  if (!W) return null;
  return <W slide={{ config, title: null }} ctx={ctx} onNext={onNext} chromeless />;
}
