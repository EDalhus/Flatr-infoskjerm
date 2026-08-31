import { useRef, useState } from 'react';
import { BASE_SIZE, backgroundStyle } from '../../../lib/deck.js';
import { useFitScale } from '../../../hooks/useFitScale.js';
import ElementView from '../../../viewer/ElementView.jsx';
import { usePreviewCtx } from './previewCtx.js';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HPOS = {
  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
  s: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize'
};

const TH = 0.7; // snap-terskel i % av canvas
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v) => Math.round(v * 2) / 2;

function applyResize(dir, o, dx, dy) {
  let { x, y, w, h } = o;
  if (dir.includes('e')) w = o.w + dx;
  if (dir.includes('s')) h = o.h + dy;
  if (dir.includes('w')) {
    w = o.w - dx;
    x = o.x + dx;
  }
  if (dir.includes('n')) {
    h = o.h - dy;
    y = o.y + dy;
  }
  w = clamp(w, 3, 100);
  h = clamp(h, 3, 100);
  x = clamp(x, 0, 100 - w);
  y = clamp(y, 0, 100 - h);
  return { x, y, w, h };
}

function bestSnap(edges, cands, th) {
  let best = null;
  for (const ev of edges)
    for (const cv of cands) {
      const diff = cv - ev;
      if (Math.abs(diff) <= th && (best === null || Math.abs(diff) < Math.abs(best.diff)))
        best = { diff, at: cv };
    }
  return best;
}

function DragMeasure({ el, base }) {
  const pxL = Math.round((el.x / 100) * base.w);
  const pxR = Math.round(((100 - el.x - el.w) / 100) * base.w);
  const pxT = Math.round((el.y / 100) * base.h);
  const pxB = Math.round(((100 - el.y - el.h) / 100) * base.h);
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const Lbl = ({ style, children }) => (
    <div
      className="absolute whitespace-nowrap rounded bg-rose-500 px-1.5 py-0.5 text-[13px] font-bold text-white"
      style={{ transform: 'translate(-50%, -50%)', ...style }}
    >
      {children}
    </div>
  );
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute border-t-2 border-dashed border-rose-400/80" style={{ left: 0, width: `${el.x}%`, top: `${cy}%` }} />
      <Lbl style={{ left: `${el.x / 2}%`, top: `${cy}%` }}>{pxL}</Lbl>
      <div
        className="absolute border-t-2 border-dashed border-rose-400/80"
        style={{ left: `${el.x + el.w}%`, width: `${100 - el.x - el.w}%`, top: `${cy}%` }}
      />
      <Lbl style={{ left: `${el.x + el.w + (100 - el.x - el.w) / 2}%`, top: `${cy}%` }}>{pxR}</Lbl>
      <div className="absolute border-l-2 border-dashed border-rose-400/80" style={{ top: 0, height: `${el.y}%`, left: `${cx}%` }} />
      <Lbl style={{ top: `${el.y / 2}%`, left: `${cx}%` }}>{pxT}</Lbl>
      <div
        className="absolute border-l-2 border-dashed border-rose-400/80"
        style={{ top: `${el.y + el.h}%`, height: `${100 - el.y - el.h}%`, left: `${cx}%` }}
      />
      <Lbl style={{ top: `${el.y + el.h + (100 - el.y - el.h) / 2}%`, left: `${cx}%` }}>{pxB}</Lbl>
      <div
        className="absolute rounded bg-ink px-1.5 py-0.5 text-[13px] font-bold text-white"
        style={{ left: `${el.x}%`, top: `${el.y}%`, transform: 'translateY(-130%)' }}
      >
        {Math.round((el.w / 100) * base.w)} × {Math.round((el.h / 100) * base.h)}
      </div>
    </div>
  );
}

export default function CanvasStage({
  slide,
  orientation,
  selectedId,
  onSelect,
  onChange,
  onDeleteElement,
  snapEnabled = true
}) {
  const base = BASE_SIZE[orientation] || BASE_SIZE.landscape;
  const { containerRef, scale } = useFitScale(base.w, base.h);
  const stageRef = useRef(null);
  const drag = useRef(null);
  const [guides, setGuides] = useState([]);
  const [dragId, setDragId] = useState(null);

  const elements = [...(slide?.elements || [])].sort((a, b) => a.z - b.z || a.id - b.id);
  const ctx = usePreviewCtx();

  const begin = (e, el, mode, dir) => {
    e.stopPropagation();
    onSelect(el.id);
    setDragId(el.id);
    drag.current = {
      mode,
      dir,
      id: el.id,
      rect: stageRef.current.getBoundingClientRect(),
      sx: e.clientX,
      sy: e.clientY,
      o: { x: el.x, y: el.y, w: el.w, h: el.h }
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const startMove = (e, el) => begin(e, el, 'move');
  const startResize = (e, el, dir) => begin(e, el, 'resize', dir);

  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = ((e.clientX - d.sx) / d.rect.width) * 100;
    const dy = ((e.clientY - d.sy) / d.rect.height) * 100;
    const others = elements.filter((x) => x.id !== d.id);
    const xCands = [0, 50, 100, ...others.flatMap((x) => [x.x, x.x + x.w / 2, x.x + x.w])];
    const yCands = [0, 50, 100, ...others.flatMap((x) => [x.y, x.y + x.h / 2, x.y + x.h])];
    const g = [];

    if (d.mode === 'move') {
      let nx = clamp(d.o.x + dx, 0, 100 - d.o.w);
      let ny = clamp(d.o.y + dy, 0, 100 - d.o.h);
      if (snapEnabled) {
        const sx = bestSnap([nx, nx + d.o.w / 2, nx + d.o.w], xCands, TH);
        const sy = bestSnap([ny, ny + d.o.h / 2, ny + d.o.h], yCands, TH);
        if (sx) {
          nx = clamp(nx + sx.diff, 0, 100 - d.o.w);
          g.push({ axis: 'x', at: sx.at });
        }
        if (sy) {
          ny = clamp(ny + sy.diff, 0, 100 - d.o.h);
          g.push({ axis: 'y', at: sy.at });
        }
      }
      setGuides(g);
      onChange(d.id, { x: round(nx), y: round(ny) }, false);
    } else {
      const r = applyResize(d.dir, d.o, dx, dy);
      if (snapEnabled) {
        if (d.dir.includes('e')) {
          const s = bestSnap([r.x + r.w], xCands, TH);
          if (s) {
            r.w = clamp(r.w + s.diff, 3, 100 - r.x);
            g.push({ axis: 'x', at: s.at });
          }
        }
        if (d.dir.includes('w')) {
          const s = bestSnap([r.x], xCands, TH);
          if (s) {
            r.x = clamp(r.x + s.diff, 0, r.x + r.w - 3);
            r.w -= s.diff;
            g.push({ axis: 'x', at: s.at });
          }
        }
        if (d.dir.includes('s')) {
          const s = bestSnap([r.y + r.h], yCands, TH);
          if (s) {
            r.h = clamp(r.h + s.diff, 3, 100 - r.y);
            g.push({ axis: 'y', at: s.at });
          }
        }
        if (d.dir.includes('n')) {
          const s = bestSnap([r.y], yCands, TH);
          if (s) {
            r.y = clamp(r.y + s.diff, 0, r.y + r.h - 3);
            r.h -= s.diff;
            g.push({ axis: 'y', at: s.at });
          }
        }
      }
      setGuides(g);
      onChange(d.id, { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }, false);
    }
  };

  const onUp = (e) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setGuides([]);
    setDragId(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const el = elements.find((x) => x.id === d.id);
    if (el) onChange(d.id, { x: el.x, y: el.y, w: el.w, h: el.h }, true);
  };

  const onKeyDown = (e) => {
    if (!selectedId) return;
    const el = elements.find((x) => x.id === selectedId);
    if (!el) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDeleteElement?.(selectedId);
      return;
    }
    const step = e.shiftKey ? 5 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!mv) return;
    e.preventDefault();
    onChange(
      selectedId,
      { x: clamp(el.x + mv[0], 0, 100 - el.w), y: clamp(el.y + mv[1], 0, 100 - el.h) },
      true
    );
  };

  const dragEl = dragId ? elements.find((x) => x.id === dragId) : null;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="absolute inset-0 overflow-hidden bg-[#1b1e24] outline-none"
    >
      <div
        ref={stageRef}
        onPointerDown={() => onSelect(null)}
        className="absolute left-1/2 top-1/2 origin-center text-white shadow-[0_20px_60px_rgba(0,0,0,0.5)] ring-1 ring-white/10"
        style={{
          width: base.w,
          height: base.h,
          transform: `translate(-50%, -50%) scale(${scale || 0.0001})`,
          ...backgroundStyle(slide?.background)
        }}
      >
        {elements.map((el) => {
          const sel = el.id === selectedId;
          return (
            <div
              key={el.id}
              onPointerDown={(e) => startMove(e, el)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              className={`absolute cursor-move ${
                sel
                  ? 'outline outline-[3px] outline-brand'
                  : 'outline outline-1 outline-white/20 hover:outline-brand/50'
              }`}
              style={{
                left: `${el.x}%`,
                top: `${el.y}%`,
                width: `${el.w}%`,
                height: `${el.h}%`,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined
              }}
            >
              <div className="pointer-events-none h-full w-full">
                <ElementView element={el} ctx={ctx} />
              </div>
              {sel &&
                HANDLES.map((dir) => (
                  <div
                    key={dir}
                    onPointerDown={(e) => startResize(e, el, dir)}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    className={`absolute h-3 w-3 rounded-sm border-2 border-brand bg-white ${HPOS[dir]}`}
                  />
                ))}
            </div>
          );
        })}

        {guides.map((gd, i) =>
          gd.axis === 'x' ? (
            <div
              key={i}
              className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-rose-500"
              style={{ left: `${gd.at}%` }}
            />
          ) : (
            <div
              key={i}
              className="pointer-events-none absolute left-0 right-0 h-0.5 bg-rose-500"
              style={{ top: `${gd.at}%` }}
            />
          )
        )}

        {dragEl && <DragMeasure el={dragEl} base={base} />}
      </div>
    </div>
  );
}
