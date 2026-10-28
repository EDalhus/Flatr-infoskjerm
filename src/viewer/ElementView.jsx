import { useLayoutEffect, useRef, useState } from 'react';
import ClockSlide from './slides/ClockSlide.jsx';
import CountdownSlide from './slides/CountdownSlide.jsx';
import ProgramSlide from './slides/ProgramSlide.jsx';
import QrSlide from './slides/QrSlide.jsx';
import VideoSlide from './slides/VideoSlide.jsx';
import WebSlide from './slides/WebSlide.jsx';
import SponsorSlide from './slides/SponsorSlide.jsx';
import WeatherSlide from './slides/WeatherSlide.jsx';
import RssSlide from './slides/RssSlide.jsx';
import CalendarSlide from './slides/CalendarSlide.jsx';
import CarouselSlide from './slides/CarouselSlide.jsx';
import AppSlide from './slides/AppSlide.jsx';

/**
 * Krymper teksten (ned til 40 %, som på Apple TV) når den ikke får plass i
 * boksen. Måles på nytt når teksten, boksen eller skriftene endrer seg.
 */
function useFitText(outerRef, innerRef, deps, enabled) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return undefined;
    if (!enabled) {
      setScale(1);
      return undefined;
    }
    const fits = (s) => {
      inner.style.fontSize = `${s * 100}%`;
      return inner.scrollHeight <= outer.clientHeight + 1 && inner.scrollWidth <= outer.clientWidth + 1;
    };
    const measure = () => {
      if (!outer.clientHeight || !outer.clientWidth) return;
      let best = 1;
      if (!fits(1)) {
        let lo = 0.4;
        let hi = 1;
        for (let i = 0; i < 7; i++) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) lo = mid;
          else hi = mid;
        }
        best = lo;
      }
      inner.style.fontSize = '';
      setScale((s) => (Math.abs(s - best) > 0.005 ? best : s));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
  return scale;
}

function TextEl({ config }) {
  const c = config || {};
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const fit = useFitText(outerRef, innerRef, [c.text, c.size, c.font, c.weight, c.lineHeight, c.tracking], c.autoFit !== false);
  const alignItems =
    c.valign === 'middle' ? 'center' : c.valign === 'bottom' ? 'flex-end' : 'flex-start';
  const decoration = [c.underline && 'underline', c.strike && 'line-through']
    .filter(Boolean)
    .join(' ');

  const style = {
    fontFamily: c.font || undefined,
    fontSize: (c.size ?? 64) * fit,
    fontWeight: c.weight ?? 700,
    fontStyle: c.italic ? 'italic' : 'normal',
    textAlign: c.align || 'left',
    lineHeight: c.lineHeight ?? 1.1,
    letterSpacing: c.tracking ? `${c.tracking}px` : undefined,
    textDecoration: decoration || undefined,
    textShadow: c.shadow ? '0 2px 12px rgba(0,0,0,0.45)' : undefined
  };

  const fill = c.fill && c.fill.type === 'gradient' ? c.fill : null;
  if (fill) {
    style.backgroundImage = `linear-gradient(${fill.angle ?? 294}deg, ${fill.from || '#3b82f6'}, ${
      fill.to || '#ec4899'
    })`;
    style.WebkitBackgroundClip = 'text';
    style.backgroundClip = 'text';
    style.color = 'transparent';
  } else {
    style.color = c.color || '#ffffff';
  }

  return (
    <div ref={outerRef} className="flex h-full w-full overflow-hidden" style={{ alignItems }}>
      <div className="w-full whitespace-pre-wrap break-words" style={style}>
        <span ref={innerRef} className="block">
          {c.text ?? ''}
        </span>
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
  sponsors: SponsorSlide,
  weather: WeatherSlide,
  rss: RssSlide,
  calendar: CalendarSlide,
  carousel: CarouselSlide,
  app: AppSlide
};

export default function ElementView({ element, ctx, onNext }) {
  const { kind, config } = element;
  if (kind === 'text') return <TextEl config={config} />;
  if (kind === 'image') return <ImageEl config={config} />;
  if (kind === 'shape') return <ShapeEl config={config} />;
  const W = WIDGET[kind];
  if (!W) return null;
  return <W slide={{ config, title: null, elementId: element.id }} ctx={ctx} onNext={onNext} chromeless />;
}
