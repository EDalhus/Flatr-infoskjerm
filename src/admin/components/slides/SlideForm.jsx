import { useEffect, useRef, useState } from 'react';
import {
  PROGRAM_MODES,
  MESSAGE_EMPHASIS,
  defaultConfig,
  newLayoutElement
} from '../../../lib/slides.js';
import { api } from '../../../lib/api.js';
import { isoToLocalInput, localInputToIso } from '../../../lib/time.js';
import { WEEKDAYS, hasDaypart } from '../../../lib/daypart.js';
import { useNow } from '../../../hooks/useNow.js';
import { Icon, Field, Input, Select, Textarea, Button } from '../ui.jsx';
import { MediaField } from '../MediaPicker.jsx';
import SlidePreview from './SlidePreview.jsx';

/* Delt, mellomlagret forhåndsvisnings-data (program/sponsorer/kategorier). */
let ctxCache = null;
let ctxPromise = null;
function usePreviewData() {
  const [data, setData] = useState(ctxCache);
  useEffect(() => {
    if (ctxCache) return;
    ctxPromise = ctxPromise || api.getState().catch(() => ({}));
    ctxPromise.then((s) => {
      ctxCache = {
        schedule: s?.schedule || [],
        sponsors: s?.sponsors || [],
        categories: s?.categories || []
      };
      setData(ctxCache);
    });
  }, []);
  return data || { schedule: [], sponsors: [], categories: [] };
}

/* ---------- tidsstyring ---------- */

function DaypartSection({ daypart, setDp }) {
  const [open, setOpen] = useState(hasDaypart(daypart));
  const days = String(daypart.active_days || '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter(Boolean);
  const toggleDay = (n) => {
    const next = days.includes(n) ? days.filter((d) => d !== n) : [...days, n].sort();
    setDp({ active_days: next.join(',') });
  };

  return (
    <div className="sm:col-span-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted"
      >
        <Icon name={open ? 'down' : 'chevron'} className="h-3.5 w-3.5" />
        Vises når
        {hasDaypart(daypart) && (
          <span className="rounded-full bg-brand-tint px-1.5 text-[10px] text-brand">aktiv</span>
        )}
      </button>

      {open && (
        <div className="mt-2 grid gap-3 rounded-lg border border-hair bg-card p-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            Fra klokkeslett
            <Input
              type="time"
              value={daypart.active_from || ''}
              onChange={(e) => setDp({ active_from: e.target.value })}
            />
          </label>
          <label className="text-xs text-muted">
            Til klokkeslett
            <Input
              type="time"
              value={daypart.active_to || ''}
              onChange={(e) => setDp({ active_to: e.target.value })}
            />
          </label>
          <div className="sm:col-span-2">
            <div className="mb-1 text-xs text-muted">Ukedager (ingen valgt = alle)</div>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.n}
                  type="button"
                  onClick={() => toggleDay(d.n)}
                  className={`h-8 w-9 rounded-lg border text-xs font-bold ${
                    days.includes(d.n)
                      ? 'border-brand bg-brand text-white'
                      : 'border-line bg-card text-muted'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <label className="text-xs text-muted">
            Fra dato
            <Input
              type="date"
              value={daypart.active_from_date || ''}
              onChange={(e) => setDp({ active_from_date: e.target.value })}
            />
          </label>
          <label className="text-xs text-muted">
            Til dato
            <Input
              type="date"
              value={daypart.active_to_date || ''}
              onChange={(e) => setDp({ active_to_date: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

/* ---------- drag-håndtak for fri «layout»-slide ---------- */

function LayoutOverlay({ elements, selId, onSelect, onMove }) {
  const areaRef = useRef(null);
  const drag = useRef(null);

  const down = (e, el) => {
    onSelect(el.id);
    drag.current = {
      id: el.id,
      rect: areaRef.current.getBoundingClientRect(),
      sx: e.clientX,
      sy: e.clientY,
      ox: el.x,
      oy: el.y
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = ((e.clientX - d.sx) / d.rect.width) * 100;
    const dy = ((e.clientY - d.sy) / d.rect.height) * 100;
    onMove(d.id, {
      x: Math.max(0, Math.min(100, Math.round(d.ox + dx))),
      y: Math.max(0, Math.min(100, Math.round(d.oy + dy)))
    });
  };
  const up = () => {
    drag.current = null;
  };

  return (
    <div className="pointer-events-none absolute inset-0 p-3">
      <div ref={areaRef} className="pointer-events-auto relative h-full w-full">
        {elements.map((el) => (
          <div
            key={el.id}
            onPointerDown={(e) => down(e, el)}
            onPointerMove={move}
            onPointerUp={up}
            className={`absolute cursor-move ${
              el.id === selId
                ? 'outline outline-[6px] outline-brand'
                : 'outline outline-2 outline-brand/30 hover:outline-brand/60'
            }`}
            style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function LayoutControls({ config, setCfg, selId, setSelId }) {
  const elements = Array.isArray(config.elements) ? config.elements : [];
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
        <span className="text-xs text-muted">Dra elementene på forhåndsvisningen.</span>
      </div>

      {elements.length === 0 && (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
          Ingen elementer. Legg til tekst eller bilde.
        </p>
      )}

      {elements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {elements.map((e, i) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelId(e.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                e.id === selId ? 'border-brand bg-brand-tint text-brand' : 'border-line text-muted'
              }`}
            >
              {e.kind === 'image' ? 'Bilde' : 'Tekst'} {i + 1}
            </button>
          ))}
        </div>
      )}

      {sel && (
        <div className="mt-3 rounded-lg border border-hair bg-card p-3">
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
                <Select
                  value={sel.weight}
                  onChange={(e) => patchEl(sel.id, { weight: Number(e.target.value) })}
                >
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
              <MediaField label="Bilde" value={sel.url} onChange={(url) => patchEl(sel.id, { url })} />
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

/* ---------- generisk slide-skjema med live forhåndsvisning ---------- */

export default function SlideForm({ slide, categories = [], onSave, onCancel, onSaveTemplate }) {
  const preview = usePreviewData();
  const now = useNow(1000);
  const [form, setForm] = useState({
    title: slide.title || '',
    duration_seconds: slide.duration_seconds,
    enabled: slide.enabled !== 0,
    config: { ...defaultConfig(slide.type), ...(slide.config || {}) },
    daypart: {
      active_from: slide.active_from || '',
      active_to: slide.active_to || '',
      active_days: slide.active_days || '',
      active_from_date: slide.active_from_date || '',
      active_to_date: slide.active_to_date || ''
    }
  });
  const [selEl, setSelEl] = useState(form.config.elements?.[0]?.id || null);
  const [busy, setBusy] = useState(false);
  const setCfg = (patch) => setForm((f) => ({ ...f, config: { ...f.config, ...patch } }));
  const setDp = (patch) => setForm((f) => ({ ...f, daypart: { ...f.daypart, ...patch } }));

  const toggleCat = (id) => {
    const cur = Array.isArray(form.config.categoryIds) ? form.config.categoryIds : [];
    setCfg({ categoryIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  const payload = () => ({
    title: form.title || null,
    duration_seconds: Number(form.duration_seconds) || 15,
    enabled: form.enabled,
    config: form.config,
    ...form.daypart
  });

  const save = async () => {
    setBusy(true);
    try {
      await onSave(payload());
    } finally {
      setBusy(false);
    }
  };

  const cats = categories.length ? categories : preview.categories;
  const draft = { type: slide.type, title: form.title, config: form.config };
  const ctx = {
    schedule: preview.schedule,
    sponsors: preview.sponsors,
    categories: cats,
    screenId: slide.screen_id,
    now
  };
  const moveEl = (id, patch) =>
    setCfg({
      elements: (form.config.elements || []).map((e) => (e.id === id ? { ...e, ...patch } : e))
    });

  const check = (label, key, invert) => (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        checked={invert ? form.config[key] !== false : !!form.config[key]}
        onChange={(e) => setCfg({ [key]: e.target.checked })}
        className="h-4 w-4 rounded border-line text-brand"
      />
      {label}
    </label>
  );

  return (
    <div className="border-t border-hair bg-paper px-4 py-4 sm:px-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="order-2 grid content-start gap-3 sm:grid-cols-2 lg:order-1">
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
                  {cats.map((c) => {
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
              <div className="sm:col-span-2">{check('Vis kategori-merke på skjermen', 'showCategory', true)}</div>
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
                <Select
                  value={form.config.emphasis}
                  onChange={(e) => setCfg({ emphasis: e.target.value })}
                >
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
                <Input
                  value={form.config.caption}
                  onChange={(e) => setCfg({ caption: e.target.value })}
                />
              </Field>
            </>
          )}

          {slide.type === 'video' && (
            <>
              <div className="sm:col-span-2">
                <Field label="Video-URL" hint="Direkte MP4/WebM, eller YouTube/Vimeo-lenke.">
                  <Input
                    value={form.config.url}
                    onChange={(e) => setCfg({ url: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>
              </div>
              <Field label="Tilpasning">
                <Select value={form.config.fit} onChange={(e) => setCfg({ fit: e.target.value })}>
                  <option value="contain">Vis hele</option>
                  <option value="cover">Fyll flaten</option>
                </Select>
              </Field>
              <div className="flex flex-col gap-2">
                {check('Løkke', 'loop')}
                {check('Uten lyd', 'mute', true)}
              </div>
              <p className="text-xs text-muted sm:col-span-2">
                MP4/WebM går videre automatisk når filmen er ferdig (om «Løkke» er av). YouTube/Vimeo
                spiller til varigheten er ute.
              </p>
            </>
          )}

          {slide.type === 'web' && (
            <>
              <div className="sm:col-span-2">
                <Field label="Nettside-URL" hint="Noen sider blokkerer innramming (X-Frame-Options).">
                  <Input
                    value={form.config.url}
                    onChange={(e) => setCfg({ url: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>
              </div>
              <Field label="Oppdater hvert (min, 0 = aldri)">
                <Input
                  type="number"
                  min={0}
                  value={form.config.refreshMinutes}
                  onChange={(e) => setCfg({ refreshMinutes: Number(e.target.value) || 0 })}
                />
              </Field>
            </>
          )}

          {slide.type === 'qr' && (
            <>
              <Field label="Innhold">
                <Select value={form.config.mode} onChange={(e) => setCfg({ mode: e.target.value })}>
                  <option value="url">Egendefinert lenke</option>
                  <option value="schedule">Programside for denne skjermen</option>
                </Select>
              </Field>
              {form.config.mode !== 'schedule' && (
                <div className="sm:col-span-2">
                  <Field label="Lenke">
                    <Input
                      value={form.config.url}
                      onChange={(e) => setCfg({ url: e.target.value })}
                      placeholder="https://…"
                    />
                  </Field>
                </div>
              )}
              <Field label="Overskrift (valgfri)">
                <Input value={form.config.label} onChange={(e) => setCfg({ label: e.target.value })} />
              </Field>
              <Field label="Undertekst (valgfri)">
                <Input
                  value={form.config.caption}
                  onChange={(e) => setCfg({ caption: e.target.value })}
                />
              </Field>
            </>
          )}

          {slide.type === 'countdown' && (
            <>
              <Field label="Mål">
                <Select value={form.config.mode} onChange={(e) => setCfg({ mode: e.target.value })}>
                  <option value="fixed">Fast tidspunkt</option>
                  <option value="nextItem">Neste programpost</option>
                </Select>
              </Field>
              {form.config.mode !== 'nextItem' && (
                <Field label="Tidspunkt">
                  <Input
                    type="datetime-local"
                    value={form.config.target ? isoToLocalInput(form.config.target) : ''}
                    onChange={(e) =>
                      setCfg({ target: e.target.value ? localInputToIso(e.target.value) : '' })
                    }
                  />
                </Field>
              )}
              <Field label="Overskrift (valgfri)">
                <Input value={form.config.title} onChange={(e) => setCfg({ title: e.target.value })} />
              </Field>
              <Field label="Tekst når ferdig">
                <Input
                  value={form.config.doneText}
                  onChange={(e) => setCfg({ doneText: e.target.value })}
                />
              </Field>
              <Field label="Uttrykk">
                <Select
                  value={form.config.emphasis}
                  onChange={(e) => setCfg({ emphasis: e.target.value })}
                >
                  {MESSAGE_EMPHASIS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          {slide.type === 'clock' && (
            <div className="flex flex-col gap-2 sm:col-span-2">
              {check('Vis dato', 'showDate', true)}
              {check('Vis sekunder', 'showSeconds', true)}
            </div>
          )}

          {slide.type === 'sponsors' && (
            <p className="text-sm text-muted sm:col-span-2">
              Viser alle sponsorer fra «Sponsorer». Hver sponsor roterer i sin egen varighet.
            </p>
          )}

          {slide.type === 'layout' && (
            <LayoutControls config={form.config} setCfg={setCfg} selId={selEl} setSelId={setSelEl} />
          )}

          <DaypartSection daypart={form.daypart} setDp={setDp} />
        </div>

        <div className="order-1 lg:order-2">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Forhåndsvisning
          </div>
          <SlidePreview slide={draft} ctx={ctx}>
            {slide.type === 'layout' && (
              <LayoutOverlay
                elements={form.config.elements || []}
                selId={selEl}
                onSelect={setSelEl}
                onMove={moveEl}
              />
            )}
          </SlidePreview>
        </div>
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
