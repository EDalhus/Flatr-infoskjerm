// Bildeverktøy i editoren: beskjær og roter (lagres som en ny fil i biblioteket,
// så bildet ser likt ut på alle skjermer), og fokuspunkt (det som alltid skal synes
// når bildet fyller flaten og må beskjæres, f.eks. på en stående skjerm).

import { useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api.js';
import { Button, Icon, ErrorText } from '../ui.jsx';

/** Media-id-en i en Flatr-adresse («/api/media?id=12&raw=1» eller «/m/12.jpg»), ellers null. */
export const mediaIdFrom = (url) => Number((/[?&]id=(\d+)/.exec(url || '') || /\/m\/(\d+)[v.]/.exec(url || '') || [])[1]) || null;

/** Klikk i bildet for å velge hva som alltid skal synes. */
export function FocusPicker({ url, value, onChange }) {
  const f = value || { x: 50, y: 50 };
  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
    onChange({ x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) });
  };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted">
        <span>Fokuspunkt</span>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="font-semibold text-brand hover:underline">
            Midten
          </button>
        )}
      </div>
      <button type="button" onClick={pick} className="relative block max-w-full cursor-crosshair overflow-hidden rounded-lg border border-hair bg-zone" aria-label="Velg fokuspunkt">
        <img src={url} alt="" className="block max-h-40 max-w-full select-none" draggable={false} />
        <span
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand/40 shadow-[0_0_0_2px_rgba(0,0,0,0.45)]"
          style={{ left: `${f.x}%`, top: `${f.y}%` }}
        />
      </button>
      <p className="m-0 mt-1 text-xs text-muted">Klikk på det som alltid skal synes når bildet fyller flaten.</p>
    </div>
  );
}

const ASPECTS = [
  { id: 'free', label: 'Fri' },
  { id: 'box', label: 'Som boksen' },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 }
];
const MIN = 4; // minste utsnitt, i prosent
const PREVIEW_PX = 1400;
const MAX_OUT_PX = 4096;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Største utsnitt med gitt forhold (bredde/høyde i piksler), midt i bildet. */
function centered(ratio, W, H) {
  if (!ratio) return { x: 0, y: 0, w: 100, h: 100 };
  let w = 100;
  let h = ((W / H) * 100) / ratio;
  if (h > 100) {
    h = 100;
    w = ((H / W) * 100) * ratio;
  }
  return { x: (100 - w) / 2, y: (100 - h) / 2, w, h };
}

/**
 * Beskjær og roter. `src` er originalen, `initial` = { crop, rotate } fra forrige gang.
 * onDone({ blob, type, crop, rotate }) får det ferdige bildet.
 */
export function CropModal({ src, initial, boxRatio, onDone, onClose }) {
  const [bitmap, setBitmap] = useState(null);
  const [type, setType] = useState('image/jpeg');
  const [rotate, setRotate] = useState(initial?.rotate || 0);
  const [crop, setCrop] = useState(initial?.crop || { x: 0, y: 0, w: 100, h: 100 });
  const [aspect, setAspect] = useState('free');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef(null);
  const areaRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error())))
      .then(async (blob) => {
        const bmp = await createImageBitmap(blob);
        if (!alive) return;
        setType(blob.type || 'image/jpeg');
        setBitmap(bmp);
      })
      .catch(() => alive && setError('Fikk ikke åpnet bildet. Bilder fra andre nettsteder kan ikke beskjæres – legg dem i biblioteket først.'));
    return () => {
      alive = false;
    };
  }, [src]);

  // Bildet etter rotasjon (W×H) og forhåndsvisningen av det.
  const W = bitmap ? (rotate % 180 ? bitmap.height : bitmap.width) : 1;
  const H = bitmap ? (rotate % 180 ? bitmap.width : bitmap.height) : 1;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!bitmap || !canvas) return;
    const s = Math.min(1, PREVIEW_PX / Math.max(W, H));
    canvas.width = Math.round(W * s);
    canvas.height = Math.round(H * s);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.translate(W / 2, H / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  }, [bitmap, rotate, W, H]);

  const ratioOf = (id) => (id === 'box' ? boxRatio : ASPECTS.find((a) => a.id === id)?.ratio) || null;
  const ratio = ratioOf(aspect);

  const chooseAspect = (id) => {
    setAspect(id);
    setCrop(centered(ratioOf(id), W, H));
  };
  const turn = (deg) => {
    setRotate((r) => (r + deg + 360) % 360);
    setCrop({ x: 0, y: 0, w: 100, h: 100 });
    setAspect('free');
  };

  // Dra utsnittet (flytt) eller et håndtak (endre størrelse).
  const start = (mode) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = areaRef.current.getBoundingClientRect();
    drag.current = { mode, x: e.clientX, y: e.clientY, crop, rect };
    const move = (ev) => {
      const d = drag.current;
      if (!d) return;
      const dx = ((ev.clientX - d.x) / d.rect.width) * 100;
      const dy = ((ev.clientY - d.y) / d.rect.height) * 100;
      const c = d.crop;
      if (d.mode === 'move') {
        setCrop({ ...c, x: clamp(c.x + dx, 0, 100 - c.w), y: clamp(c.y + dy, 0, 100 - c.h) });
        return;
      }
      let { x, y, w, h } = c;
      if (d.mode.includes('e')) w = clamp(c.w + dx, MIN, 100 - c.x);
      if (d.mode.includes('s')) h = clamp(c.h + dy, MIN, 100 - c.y);
      if (d.mode.includes('w')) {
        x = clamp(c.x + dx, 0, c.x + c.w - MIN);
        w = c.w + (c.x - x);
      }
      if (d.mode.includes('n')) {
        y = clamp(c.y + dy, 0, c.y + c.h - MIN);
        h = c.h + (c.y - y);
      }
      if (ratio) {
        // Fast forhold: høyden følger bredden (eller omvendt for topp/bunn), innenfor bildet.
        if (d.mode === 'n' || d.mode === 's') w = ((h * H) / W) * ratio;
        else h = ((w * W) / H) / ratio;
        if (y + h > 100) {
          h = 100 - y;
          w = ((h * H) / W) * ratio;
        }
        if (x + w > 100) {
          w = 100 - x;
          h = ((w * W) / H) / ratio;
        }
        if (d.mode.includes('n')) y = c.y + c.h - h;
        if (d.mode.includes('w')) x = c.x + c.w - w;
      }
      setCrop({ x, y, w, h });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const apply = async () => {
    if (!bitmap) return;
    setBusy(true);
    setError('');
    try {
      const sx = (crop.x / 100) * W;
      const sy = (crop.y / 100) * H;
      const sw = (crop.w / 100) * W;
      const sh = (crop.h / 100) * H;
      const s = Math.min(1, MAX_OUT_PX / Math.max(sw, sh));
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(sw * s));
      out.height = Math.max(1, Math.round(sh * s));
      const ctx = out.getContext('2d');
      ctx.setTransform(s, 0, 0, s, -sx * s, -sy * s);
      ctx.translate(W / 2, H / 2);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      // Gjennomsiktighet beholdes for PNG og WebP, ellers JPEG.
      const outType = /png|webp|gif/.test(type) ? 'image/png' : 'image/jpeg';
      const blob = await new Promise((resolve) => out.toBlob(resolve, outType, 0.9));
      if (!blob) throw new Error('Fikk ikke laget bildet');
      await onDone({ blob, type: outType, crop, rotate });
    } catch (e) {
      setError(e.message || 'Noe gikk galt');
      setBusy(false);
    }
  };

  const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const handlePos = { nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50], se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50] };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="flex max-h-full w-full max-w-4xl flex-col gap-4 rounded-2xl border border-hair bg-card p-5 shadow-pop">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 mr-auto text-lg font-bold text-ink">Beskjær og roter</h2>
          <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-paper p-1" role="group" aria-label="Forhold">
            {ASPECTS.filter((a) => a.id !== 'box' || boxRatio).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => chooseAspect(a.id)}
                aria-pressed={aspect === a.id}
                className={`h-8 rounded-lg px-2.5 text-xs font-semibold ${aspect === a.id ? 'bg-card text-ink shadow-card' : 'text-muted hover:text-ink'}`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => turn(-90)} aria-label="Roter mot klokka">
            ⟲
          </Button>
          <Button variant="outline" size="sm" onClick={() => turn(90)} aria-label="Roter med klokka">
            ⟳
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-xl bg-[#0b0d10] p-4">
          {bitmap ? (
            <div ref={areaRef} className="relative max-h-[60vh] select-none" style={{ aspectRatio: `${W} / ${H}`, width: `min(100%, calc(60vh * ${W / H}))` }}>
              <canvas ref={canvasRef} className="block h-full w-full" />
              <div className="absolute inset-0 overflow-hidden">
                <div
                  onPointerDown={start('move')}
                  className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                  style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%` }}
                >
                  {/* Tredjedelslinjer */}
                  <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(to right, transparent 33.2%, rgba(255,255,255,.35) 33.3%, transparent 33.5%, transparent 66.5%, rgba(255,255,255,.35) 66.6%, transparent 66.8%), linear-gradient(to bottom, transparent 33.2%, rgba(255,255,255,.35) 33.3%, transparent 33.5%, transparent 66.5%, rgba(255,255,255,.35) 66.6%, transparent 66.8%)' }} />
                  {handles.map((h) => (
                    <span
                      key={h}
                      onPointerDown={start(h)}
                      className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black/40 bg-white"
                      style={{ left: `${handlePos[h][0]}%`, top: `${handlePos[h][1]}%`, cursor: `${h}-resize` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="m-0 py-16 text-sm text-white/60">{error ? '' : 'Åpner bildet …'}</p>
          )}
        </div>

        <ErrorText>{error}</ErrorText>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">
            {bitmap ? `${Math.round((crop.w / 100) * W)} × ${Math.round((crop.h / 100) * H)} px · originalen beholdes i biblioteket` : ''}
          </span>
          <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={busy}>
            Avbryt
          </Button>
          <Button onClick={apply} disabled={!bitmap || busy}>
            <Icon name="check" className="h-4 w-4" />
            {busy ? 'Lagrer …' : 'Bruk'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Lagrer det beskårne bildet i samme mappe som originalen og gir adressen til det. */
export async function saveCropped({ blob, type }, originalUrl) {
  const id = mediaIdFrom(originalUrl);
  let folder = null;
  let name = 'Bilde';
  if (id) {
    const m = await api.media.get(id).catch(() => null);
    folder = m?.folder || null;
    name = String(m?.name || name).replace(/\.[a-z0-9]+$/i, '').replace(/ \(beskåret\)$/, '');
  }
  const file = new File([blob], `${name} (beskåret).${type === 'image/png' ? 'png' : 'jpg'}`, { type });
  const row = await api.media.upload(file, folder);
  return api.media.url(row.id);
}
