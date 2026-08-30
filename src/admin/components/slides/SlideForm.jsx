import { useRef, useState } from 'react';
import {
  PROGRAM_MODES,
  MESSAGE_EMPHASIS,
  defaultConfig,
  newLayoutElement
} from '../../../lib/slides.js';
import { Icon, Field, Input, Select, Textarea, Button } from '../ui.jsx';
import { MediaField } from '../MediaPicker.jsx';

/* ---------- fri «layout»-slide ---------- */

function LayoutEditor({ config, setCfg }) {
  const elements = Array.isArray(config.elements) ? config.elements : [];
  const [selId, setSelId] = useState(elements[0]?.id || null);
  const boardRef = useRef(null);
  const drag = useRef(null);

  const patchEl = (id, patch) =>
    setCfg({ elements: elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const addEl = (kind) => {
    const el = newLayoutElement(kind);
    setCfg({ elements: [...elements, el] });
    setSelId(el.id);
  };
  const removeEl = (id) => {
    setCfg({ elements: elements.filter((e) => e.id !== id) });
    setSelId(null);
  };

  const onPointerDown = (e, el) => {
    setSelId(el.id);
    const rect = boardRef.current.getBoundingClientRect();
    drag.current = { id: el.id, rect, startX: e.clientX, startY: e.clientY, ox: el.x, oy: el.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = ((e.clientX - d.startX) / d.rect.width) * 100;
    const dy = ((e.clientY - d.startY) / d.rect.height) * 100;
    patchEl(d.id, {
      x: Math.max(0, Math.min(100, Math.round(d.ox + dx))),
      y: Math.max(0, Math.min(100, Math.round(d.oy + dy)))
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const sel = elements.find((e) => e.id === selId) || null;

  return (
    <div className="sm:col-span-2">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => addEl('text')}>
          <Icon name="plus" className="h-3.5 w-3.5" />
          Tekst
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => addEl('image')}>
          <Icon name="plus" className="h-3.5 w-3.5" />
          Bilde
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Bakgrunn
          <input
            type="color"
            value={config.background === 'transparent' ? '#ffffff' : config.background || '#ffffff'}
            onChange={(e) => setCfg({ background: e.target.value })}
            className="h-8 w-10 cursor-pointer rounded border border-line bg-white"
          />
        </label>
      </div>

      <div
        ref={boardRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative aspect-video w-full overflow-hidden rounded-lg border border-line"
        style={{ backgroundColor: config.background === 'transparent' ? '#fff' : config.background || '#fff' }}
      >
        {elements.map((el) => (
          <div
            key={el.id}
            onPointerDown={(e) => onPointerDown(e, el)}
            className={`absolute cursor-move overflow-hidden ${
              el.id === selId ? 'outline outline-2 outline-brand' : 'outline outline-1 outline-line'
            }`}
            style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}
          >
            {el.kind === 'image' ? (
              el.url ? (
                <img src={el.url} alt="" className="pointer-events-none h-full w-full object-contain" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-hair text-[10px] text-muted">
                  bilde
                </div>
              )
            ) : (
              <div
                className="pointer-events-none flex h-full w-full items-center overflow-hidden"
                style={{ color: el.color }}
              >
                <span
                  className="block w-full truncate"
                  style={{ fontSize: Math.max(8, el.size / 6), fontWeight: el.weight, textAlign: el.align }}
                >
                  {el.text || 'Tekst'}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {sel && (
        <div className="mt-3 rounded-lg border border-hair bg-paper p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              {sel.kind === 'image' ? 'Bilde-element' : 'Tekst-element'}
            </span>
            <button
              type="button"
              onClick={() => removeEl(sel.id)}
              className="text-xs font-semibold text-danger hover:underline"
            >
              Fjern
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {['x', 'y', 'w', 'h'].map((k) => (
              <label key={k} className="text-xs text-muted">
                {k.toUpperCase()} %
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={sel[k]}
                  onChange={(e) => patchEl(sel.id, { [k]: Number(e.target.value) })}
                  className="mt-0.5 w-full rounded border border-line bg-white px-1.5 py-1 text-ink"
                />
              </label>
            ))}
          </div>

          {sel.kind === 'text' ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-muted sm:col-span-2">
                Tekst
                <Textarea
                  rows={2}
                  value={sel.text}
                  onChange={(e) => patchEl(sel.id, { text: e.target.value })}
                />
              </label>
              <label className="text-xs text-muted">
                Størrelse (px)
                <Input
                  type="number"
                  min={8}
                  value={sel.size}
                  onChange={(e) => patchEl(sel.id, { size: Number(e.target.value) || 48 })}
                />
              </label>
              <label className="text-xs text-muted">
                Vekt
                <Select value={sel.weight} onChange={(e) => patchEl(sel.id, { weight: Number(e.target.value) })}>
                  <option value={400}>Normal</option>
                  <option value={600}>Halvfet</option>
                  <option value={800}>Fet</option>
                </Select>
              </label>
              <label className="text-xs text-muted">
                Justering
                <Select value={sel.align} onChange={(e) => patchEl(sel.id, { align: e.target.value })}>
                  <option value="left">Venstre</option>
                  <option value="center">Midtstilt</option>
                  <option value="right">Høyre</option>
                </Select>
              </label>
              <label className="text-xs text-muted">
                Farge
                <input
                  type="color"
                  value={sel.color}
                  onChange={(e) => patchEl(sel.id, { color: e.target.value })}
                  className="mt-0.5 h-9 w-full cursor-pointer rounded border border-line bg-white"
                />
              </label>
            </div>
          ) : (
            <div className="mt-2 grid gap-2">
              <MediaField
                label="Bilde"
                value={sel.url}
                onChange={(url) => patchEl(sel.id, { url })}
              />
              <label className="text-xs text-muted">
                Tilpasning
                <Select value={sel.fit} onChange={(e) => patchEl(sel.id, { fit: e.target.value })}>
                  <option value="contain">Vis hele bildet</option>
                  <option value="cover">Fyll flaten</option>
                </Select>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- generisk slide-skjema (skjerm-slide og spilleliste-element) ---------- */

export default function SlideForm({ slide, categories = [], onSave, onCancel, onSaveTemplate }) {
  const [form, setForm] = useState({
    title: slide.title || '',
    duration_seconds: slide.duration_seconds,
    enabled: slide.enabled !== 0,
    config: { ...defaultConfig(slide.type), ...(slide.config || {}) }
  });
  const [busy, setBusy] = useState(false);
  const setCfg = (patch) => setForm((f) => ({ ...f, config: { ...f.config, ...patch } }));

  const toggleCat = (id) => {
    const cur = Array.isArray(form.config.categoryIds) ? form.config.categoryIds : [];
    setCfg({ categoryIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  const payload = () => ({
    title: form.title || null,
    duration_seconds: Number(form.duration_seconds) || 15,
    enabled: form.enabled,
    config: form.config
  });

  const save = async () => {
    setBusy(true);
    try {
      await onSave(payload());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-hair bg-paper px-4 py-4 sm:px-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tittel (valgfri)">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Varighet (sek)">
          <Input
            type="number"
            min={3}
            value={form.duration_seconds}
            onChange={(e) => setForm({ ...form, duration_seconds: e.target.value })}
          />
        </Field>

        {slide.type === 'program' && (
          <>
            <Field label="Visning">
              <Select value={form.config.mode} onChange={(e) => setCfg({ mode: e.target.value })}>
                {PROGRAM_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Maks antall poster">
              <Input
                type="number"
                min={1}
                value={form.config.max}
                onChange={(e) => setCfg({ max: Number(e.target.value) || 10 })}
              />
            </Field>
            <Field label="Kun scene (valgfri)">
              <Input
                value={form.config.stage || ''}
                onChange={(e) => setCfg({ stage: e.target.value })}
                placeholder="Alle scener"
              />
            </Field>
            <div className="sm:col-span-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Kategorier (ingen valgt = alle)
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.length === 0 && <span className="text-sm text-muted">Ingen kategorier.</span>}
                {categories.map((c) => {
                  const on = (form.config.categoryIds || []).includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCat(c.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold ${
                        on ? 'border-transparent text-white' : 'border-line bg-card text-muted'
                      }`}
                      style={on ? { backgroundColor: c.color } : undefined}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: on ? '#fff' : c.color }}
                      />
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
              <input
                type="checkbox"
                checked={form.config.showCategory !== false}
                onChange={(e) => setCfg({ showCategory: e.target.checked })}
                className="h-4 w-4 rounded border-line text-brand"
              />
              Vis kategori-merke på skjermen
            </label>
          </>
        )}

        {slide.type === 'message' && (
          <>
            <div className="sm:col-span-2">
              <Field label="Tekst">
                <Textarea
                  rows={2}
                  value={form.config.text}
                  onChange={(e) => setCfg({ text: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Uttrykk">
              <Select value={form.config.emphasis} onChange={(e) => setCfg({ emphasis: e.target.value })}>
                {MESSAGE_EMPHASIS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        {slide.type === 'image' && (
          <>
            <div className="sm:col-span-2">
              <MediaField value={form.config.url} onChange={(url) => setCfg({ url })} />
            </div>
            <Field label="Tilpasning">
              <Select value={form.config.fit} onChange={(e) => setCfg({ fit: e.target.value })}>
                <option value="contain">Vis hele bildet</option>
                <option value="cover">Fyll flaten</option>
              </Select>
            </Field>
            <Field label="Bildetekst (valgfri)">
              <Input value={form.config.caption} onChange={(e) => setCfg({ caption: e.target.value })} />
            </Field>
          </>
        )}

        {slide.type === 'clock' && (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.config.showDate !== false}
                onChange={(e) => setCfg({ showDate: e.target.checked })}
                className="h-4 w-4 rounded border-line text-brand"
              />
              Vis dato
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.config.showSeconds !== false}
                onChange={(e) => setCfg({ showSeconds: e.target.checked })}
                className="h-4 w-4 rounded border-line text-brand"
              />
              Vis sekunder
            </label>
          </div>
        )}

        {slide.type === 'sponsors' && (
          <p className="text-sm text-muted sm:col-span-2">
            Viser alle sponsorer fra «Sponsorer». Hver sponsor roterer i sin egen varighet.
          </p>
        )}

        {slide.type === 'layout' && <LayoutEditor config={form.config} setCfg={setCfg} />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-line text-brand"
          />
          Aktiv
        </label>
        {onSaveTemplate && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onSaveTemplate({ type: slide.type, ...payload() })}
          >
            Lagre som mal
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>
            Lukk
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? 'Lagrer …' : 'Lagre'}
          </Button>
        </div>
      </div>
    </div>
  );
}
