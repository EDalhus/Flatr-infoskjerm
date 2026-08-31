import { useRef } from 'react';
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
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

export default function CanvasStage({
  slide,
  orientation,
  selectedId,
  onSelect,
  onChange,
  onDeleteElement
}) {
  const base = BASE_SIZE[orientation] || BASE_SIZE.landscape;
  const { containerRef, scale } = useFitScale(base.w, base.h);
  const stageRef = useRef(null);
  const drag = useRef(null);
  const ctx = usePreviewCtx();

  const elements = [...(slide?.elements || [])].sort((a, b) => a.z - b.z || a.id - b.id);

  const startMove = (e, el) => {
    e.stopPropagation();
    onSelect(el.id);
    const rect = stageRef.current.getBoundingClientRect();
    drag.current = {
      mode: 'move',
      id: el.id,
      rect,
      sx: e.clientX,
      sy: e.clientY,
      o: { x: el.x, y: el.y, w: el.w, h: el.h }
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const startResize = (e, el, dir) => {
    e.stopPropagation();
    onSelect(el.id);
    const rect = stageRef.current.getBoundingClientRect();
    drag.current = {
      mode: 'resize',
      dir,
      id: el.id,
      rect,
      sx: e.clientX,
      sy: e.clientY,
      o: { x: el.x, y: el.y, w: el.w, h: el.h }
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = ((e.clientX - d.sx) / d.rect.width) * 100;
    const dy = ((e.clientY - d.sy) / d.rect.height) * 100;
    if (d.mode === 'move') {
      const x = round(clamp(d.o.x + dx, 0, 100 - d.o.w));
      const y = round(clamp(d.o.y + dy, 0, 100 - d.o.h));
      onChange(d.id, { x, y }, false);
    } else {
      onChange(d.id, applyResize(d.dir, d.o, dx, dy), false);
    }
  };
  const onUp = (e) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
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
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[
      e.key
    ];
    if (!d) return;
    e.preventDefault();
    const x = clamp(el.x + d[0], 0, 100 - el.w);
    const y = clamp(el.y + d[1], 0, 100 - el.h);
    onChange(selectedId, { x, y }, true);
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#12161c] outline-none"
    >
      <div
        ref={stageRef}
        onPointerDown={() => onSelect(null)}
        className="relative text-white shadow-2xl"
        style={{
          width: base.w,
          height: base.h,
          transform: `scale(${scale})`,
          transformOrigin: 'center',
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
                sel ? 'outline outline-[3px] outline-brand' : 'outline outline-1 outline-white/20 hover:outline-brand/50'
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
      </div>
    </div>
  );
}
