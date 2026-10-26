// Lerretet i editoren.
//
// To lag:
//   – innhold: lysbildet i full oppløsning (1920×1080 / 1080×1920), skalert ned
//     med CSS. Tekst redigeres direkte her, så den ser lik ut som på skjermen.
//   – overlegg: markering, håndtak, hjelpelinjer, andres markører og navn – i
//     skjermpiksler, så de alltid er like store og lesbare uansett zoom.
//
// All endring går via callbacks: onLive (under dra, sendes til andre) og
// onCommit (ved slipp, lagres og legges i angre-historikken).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BASE_SIZE, backgroundStyle, ELEMENT_LABEL } from '../../../lib/deck.js';
import ElementView from '../../../viewer/ElementView.jsx';
import DynamicBackground from '../../../viewer/DynamicBackground.jsx';
import { bestSnap, snapCandidates, resizeBox, bbox, intersects, clamp, round } from './geometry.js';

const PAD = 40;
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_POS = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5]
};
const CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function TextEditor({ el, onChange, onDone }) {
  const ref = useRef(null);
  const c = el.config || {};
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus();
    t.select();
  }, []);
  return (
    <textarea
      ref={ref}
      value={c.text ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) e.currentTarget.blur();
      }}
      className="pointer-events-auto h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
      style={{
        fontFamily: c.font || 'inherit',
        fontSize: c.size ?? 64,
        fontWeight: c.weight ?? 700,
        fontStyle: c.italic ? 'italic' : 'normal',
        textAlign: c.align || 'left',
        lineHeight: c.lineHeight ?? 1.1,
        color: c.color || '#ffffff',
        caretColor: c.color || '#ffffff'
      }}
    />
  );
}

export default function Stage({
  slide,
  orientation,
  zoom,
  ctx,
  selection,
  peers,
  locks,
  me,
  snap,
  onSelect,
  onLive,
  onCommit,
  onCursor,
  onTextLive,
  onTextCommit,
  onLockedClick
}) {
  const base = BASE_SIZE[orientation] || BASE_SIZE.landscape;
  const scrollRef = useRef(null);
  const view = useSize(scrollRef);

  const fit = view.w && view.h ? Math.min((view.w - PAD * 2) / base.w, (view.h - PAD * 2) / base.h) : 0.3;
  const s = Math.max(0.05, fit * zoom);
  const stageW = base.w * s;
  const stageH = base.h * s;
  const innerW = Math.max(view.w, stageW + PAD * 2);
  const innerH = Math.max(view.h, stageH + PAD * 2);
  const left = (innerW - stageW) / 2;
  const top = (innerH - stageH) / 2;

  const px = useCallback(
    (e) => ({ left: left + (e.x / 100) * stageW, top: top + (e.y / 100) * stageH, width: (e.w / 100) * stageW, height: (e.h / 100) * stageH }),
    [left, top, stageW, stageH]
  );

  const elements = useMemo(() => [...(slide?.elements || [])].sort((a, b) => a.z - b.z || a.id - b.id), [slide]);
  const selected = elements.filter((e) => selection.includes(e.id));
  const [guides, setGuides] = useState([]);
  const [marquee, setMarquee] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const drag = useRef(null);

  // Prosent-koordinater for et pekerpunkt.
  const toPct = (clientX, clientY) => {
    const r = scrollRef.current.querySelector('[data-inner]').getBoundingClientRect();
    return { x: ((clientX - r.left - left) / stageW) * 100, y: ((clientY - r.top - top) / stageH) * 100 };
  };

  /* -------------------------------- dra/skaler -------------------------------- */

  const startDrag = (e, mode, extra = {}) => {
    e.stopPropagation();
    e.preventDefault();
    const p = toPct(e.clientX, e.clientY);
    drag.current = { mode, start: p, moved: false, ...extra };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  };

  const onElementDown = (e, el) => {
    if (e.button !== 0) return;
    if (locks.has(el.id)) {
      onLockedClick?.(locks.get(el.id));
      return;
    }
    if (editingId === el.id) return;
    let sel = selection;
    if (e.shiftKey || e.metaKey) {
      sel = selection.includes(el.id) ? selection.filter((id) => id !== el.id) : [...selection, el.id];
      onSelect(sel);
      if (!sel.includes(el.id)) return;
    } else if (!selection.includes(el.id)) {
      sel = [el.id];
      onSelect(sel);
    }
    const movable = elements.filter((x) => sel.includes(x.id) && !locks.has(x.id));
    startDrag(e, 'move', { origin: movable.map((x) => ({ id: x.id, x: x.x, y: x.y, w: x.w, h: x.h })) });
  };

  const onHandleDown = (e, el, dir) => {
    startDrag(e, 'resize', { dir, id: el.id, o: { x: el.x, y: el.y, w: el.w, h: el.h } });
  };

  const onRotateDown = (e, el) => {
    const r = scrollRef.current.querySelector('[data-inner]').getBoundingClientRect();
    const b = px(el);
    const cx = r.left + b.left + b.width / 2;
    const cy = r.top + b.top + b.height / 2;
    startDrag(e, 'rotate', { id: el.id, cx, cy, o: el.rotation || 0 });
  };

  const onBackgroundDown = (e) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    setEditingId(null);
    if (!e.shiftKey) onSelect([]);
    startDrag(e, 'marquee', { base: e.shiftKey ? selection : [] });
  };

  const latest = useRef({});
  latest.current = { elements, selection, snap, onLive, onCommit, onSelect, stageW, stageH };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const { elements: els, snap: snapOn, onLive: live, onSelect: select } = latest.current;
    const p = toPct(e.clientX, e.clientY);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (!d.moved && Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) return;
    d.moved = true;

    if (d.mode === 'move') {
      const ids = d.origin.map((o) => o.id);
      const box = bbox(d.origin);
      let mx = dx;
      let my = dy;
      const g = [];
      if (snapOn && !e.altKey) {
        const { xs, ys } = snapCandidates(els.filter((x) => !ids.includes(x.id)));
        const sx = bestSnap([box.x + dx, box.x + dx + box.w / 2, box.x + dx + box.w], xs);
        const sy = bestSnap([box.y + dy, box.y + dy + box.h / 2, box.y + dy + box.h], ys);
        if (sx) {
          mx += sx.diff;
          g.push({ axis: 'x', at: sx.at });
        }
        if (sy) {
          my += sy.diff;
          g.push({ axis: 'y', at: sy.at });
        }
      }
      setGuides(g);
      d.patches = d.origin.map((o) => ({ id: o.id, patch: { x: round(o.x + mx), y: round(o.y + my) } }));
      live(d.patches);
    } else if (d.mode === 'resize') {
      const r = resizeBox(d.dir, d.o, dx, dy, e.shiftKey);
      const g = [];
      if (snapOn && !e.altKey) {
        const { xs, ys } = snapCandidates(els.filter((x) => x.id !== d.id));
        if (d.dir.includes('e')) {
          const sn = bestSnap([r.x + r.w], xs);
          if (sn) (r.w += sn.diff), g.push({ axis: 'x', at: sn.at });
        }
        if (d.dir.includes('w')) {
          const sn = bestSnap([r.x], xs);
          if (sn) (r.x += sn.diff), (r.w -= sn.diff), g.push({ axis: 'x', at: sn.at });
        }
        if (d.dir.includes('s')) {
          const sn = bestSnap([r.y + r.h], ys);
          if (sn) (r.h += sn.diff), g.push({ axis: 'y', at: sn.at });
        }
        if (d.dir.includes('n')) {
          const sn = bestSnap([r.y], ys);
          if (sn) (r.y += sn.diff), (r.h -= sn.diff), g.push({ axis: 'y', at: sn.at });
        }
      }
      setGuides(g);
      d.patches = [{ id: d.id, patch: { x: round(r.x), y: round(r.y), w: round(Math.max(1, r.w)), h: round(Math.max(1, r.h)) } }];
      live(d.patches);
    } else if (d.mode === 'rotate') {
      let deg = (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI + 90;
      deg = ((deg % 360) + 360) % 360;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      else if (Math.abs(deg % 90) < 3 || Math.abs((deg % 90) - 90) < 3) deg = Math.round(deg / 90) * 90;
      deg = Math.round(deg) % 360;
      d.patches = [{ id: d.id, patch: { rotation: deg } }];
      live(d.patches);
    } else if (d.mode === 'marquee') {
      const box = {
        x: Math.min(d.start.x, p.x),
        y: Math.min(d.start.y, p.y),
        w: Math.abs(p.x - d.start.x),
        h: Math.abs(p.y - d.start.y)
      };
      setMarquee(box);
      const hit = els.filter((x) => intersects(box, x)).map((x) => x.id);
      select([...new Set([...d.base, ...hit])]);
    }
  };

  const onPointerUp = () => {
    window.removeEventListener('pointermove', onPointerMove);
    const d = drag.current;
    drag.current = null;
    setGuides([]);
    setMarquee(null);
    if (d?.moved && d.patches && d.mode !== 'marquee') latest.current.onCommit(d.patches);
  };

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onPointerMove);
    },
    []
  );

  /* ---------------------------------- markør ---------------------------------- */

  const cursorTs = useRef(0);
  const trackCursor = (e) => {
    if (!onCursor || !slide || !scrollRef.current) return;
    const now = performance.now();
    if (now - cursorTs.current < 40) return;
    cursorTs.current = now;
    const p = toPct(e.clientX, e.clientY);
    if (p.x < -8 || p.x > 108 || p.y < -8 || p.y > 108) return;
    onCursor(slide.id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10);
  };

  // Avslutt tekstredigering hvis elementet forsvinner eller blir valgt bort.
  useEffect(() => {
    if (editingId && !selection.includes(editingId)) setEditingId(null);
  }, [selection, editingId]);

  const single = selected.length === 1 ? selected[0] : null;
  const groupBox = selected.length > 1 ? bbox(selected) : null;

  return (
    <div
      ref={scrollRef}
      className="relative h-full w-full overflow-auto bg-zone"
      onPointerMove={trackCursor}
      style={{ backgroundImage: 'radial-gradient(rgb(var(--c-line)) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
    >
      <div data-inner className="relative" style={{ width: innerW, height: innerH }} onPointerDown={onBackgroundDown}>
        {/* ------------------------------ innhold ------------------------------ */}
        <div
          className="pointer-events-none absolute origin-top-left overflow-hidden text-white shadow-pop"
          style={{ left, top, width: base.w, height: base.h, transform: `scale(${s})`, ...backgroundStyle(slide?.background) }}
        >
          {slide?.background?.type === 'dynamic' && <DynamicBackground bg={slide.background} />}
          {elements.map((el) => (
            <div
              key={el.id}
              className="absolute"
              style={{
                left: `${el.x}%`,
                top: `${el.y}%`,
                width: `${el.w}%`,
                height: `${el.h}%`,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined
              }}
            >
              {editingId === el.id ? (
                <TextEditor
                  el={el}
                  onChange={(text) => onTextLive(el.id, text)}
                  onDone={() => {
                    onTextCommit(el.id);
                    setEditingId(null);
                  }}
                />
              ) : el.kind === 'image' && !el.config?.url ? (
                // Tomt bilde: synlig plassholder i editoren (ellers usynlig og forvirrende).
                <div className="grid h-full w-full place-items-center border-[6px] border-dashed border-white/50 bg-white/10 text-[40px] font-semibold text-white/80">
                  Velg bilde i panelet
                </div>
              ) : (
                <ElementView element={el} ctx={ctx} />
              )}
            </div>
          ))}
        </div>

        {/* ----------------------------- treffsoner ----------------------------- */}
        {elements.map((el) => {
          const b = px(el);
          const lock = locks.get(el.id);
          return (
            <div
              key={`hit-${el.id}`}
              onPointerDown={(e) => onElementDown(e, el)}
              onDoubleClick={() => el.kind === 'text' && !lock && setEditingId(el.id)}
              onPointerEnter={() => setHoverId(el.id)}
              onPointerLeave={() => setHoverId((h) => (h === el.id ? null : h))}
              className={`absolute ${editingId === el.id ? 'pointer-events-none' : lock ? 'cursor-not-allowed' : 'cursor-move'}`}
              style={{ ...b, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
              title={lock ? `${lock.name} jobber med dette elementet` : ELEMENT_LABEL[el.kind]}
            />
          );
        })}

        {/* ------------------------------ overlegg ------------------------------ */}
        <div className="pointer-events-none absolute inset-0">
          {/* hover */}
          {hoverId && !selection.includes(hoverId) && !locks.has(hoverId) && (() => {
            const el = elements.find((x) => x.id === hoverId);
            return el ? (
              <div
                className="absolute border border-brand/60"
                style={{ ...px(el), transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
              />
            ) : null;
          })()}

          {/* andres markering (låst for meg) */}
          {elements.map((el) => {
            const p = locks.get(el.id);
            if (!p) return null;
            return (
              <div
                key={`lock-${el.id}`}
                className="absolute"
                style={{
                  ...px(el),
                  outline: `2px solid ${p.color}`,
                  background: `${p.color}14`,
                  transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined
                }}
              >
                <span
                  className="absolute -top-6 left-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-card"
                  style={{ background: p.color }}
                >
                  {p.name}
                </span>
              </div>
            );
          })}

          {/* min markering */}
          {selected.map((el) => (
            <div
              key={`sel-${el.id}`}
              className="absolute"
              style={{
                ...px(el),
                outline: `2px solid ${me?.color || 'rgb(var(--c-brand))'}`,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined
              }}
            />
          ))}
          {groupBox && (
            <div className="absolute border border-dashed" style={{ ...px(groupBox), borderColor: me?.color || 'rgb(var(--c-brand))' }} />
          )}

          {/* håndtak (ett element) */}
          {single && !locks.has(single.id) && editingId !== single.id && (() => {
            const b = px(single);
            const color = me?.color || 'rgb(var(--c-brand))';
            return (
              <div
                className="absolute"
                style={{ ...b, transform: single.rotation ? `rotate(${single.rotation}deg)` : undefined }}
              >
                {HANDLES.map((dir) => (
                  <div
                    key={dir}
                    onPointerDown={(e) => onHandleDown(e, single, dir)}
                    className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 bg-white"
                    style={{ left: `${HANDLE_POS[dir][0] * 100}%`, top: `${HANDLE_POS[dir][1] * 100}%`, borderColor: color, cursor: CURSOR[dir] }}
                  />
                ))}
                <div className="absolute left-1/2 top-0 h-6 w-px -translate-y-full" style={{ background: color }} />
                <div
                  onPointerDown={(e) => onRotateDown(e, single)}
                  title="Roter (Shift = 15° om gangen)"
                  className="pointer-events-auto absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 rounded-full border-2 bg-white"
                  style={{ borderColor: color, transform: 'translate(-50%, -36px)', cursor: 'grab' }}
                />
                <span
                  className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-paper"
                >
                  {Math.round((single.w / 100) * base.w)} × {Math.round((single.h / 100) * base.h)}
                  {single.rotation ? ` · ${single.rotation}°` : ''}
                </span>
              </div>
            );
          })()}

          {/* hjelpelinjer */}
          {guides.map((g, i) =>
            g.axis === 'x' ? (
              <div key={i} className="absolute w-px bg-danger" style={{ left: left + (g.at / 100) * stageW, top, height: stageH }} />
            ) : (
              <div key={i} className="absolute h-px bg-danger" style={{ top: top + (g.at / 100) * stageH, left, width: stageW }} />
            )
          )}

          {/* markeringsramme */}
          {marquee && (
            <div className="absolute border border-brand bg-brand/10" style={px(marquee)} />
          )}

          {/* andres markører */}
          {peers.map((p) =>
            p.cursor && p.cursor.slide === slide?.id ? (
              <div
                key={`cur-${p.id}`}
                className="absolute z-20"
                style={{
                  left: left + (p.cursor.x / 100) * stageW,
                  top: top + (p.cursor.y / 100) * stageH,
                  transition: 'left 90ms linear, top 90ms linear'
                }}
              >
                <svg width="22" height="22" viewBox="0 0 22 22" className="drop-shadow" aria-hidden="true">
                  <path d="M2 2l7.5 18 2.6-7.4L19.5 10z" fill={p.color} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
                <span
                  className="absolute left-4 top-4 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-white shadow-card"
                  style={{ background: p.color }}
                >
                  {p.name}
                </span>
              </div>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}
