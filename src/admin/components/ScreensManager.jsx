import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { LAYOUT_OPTIONS, LANDSCAPE_PRESETS, zonesForScreen } from '../../lib/layouts.js';
import {
  SLIDE_TYPES,
  SLIDE_TYPE_LABEL,
  SLIDE_TYPE_ICON,
  PROGRAM_MODES,
  MESSAGE_EMPHASIS,
  defaultConfig
} from '../../lib/slides.js';
import {
  Icon,
  Field,
  Input,
  Select,
  Textarea,
  Button,
  IconButton,
  Card,
  GroupCard,
  Row,
  MediaTile,
  PageHeader,
  ErrorText
} from './ui.jsx';

/* ============================ liste ============================ */

function OnlineDot({ online }) {
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${online ? 'bg-ok' : 'bg-muted/50'}`}
      title={online ? 'Online' : 'Offline'}
    />
  );
}

function ScreenList({ onEdit, onChange }) {
  const [screens, setScreens] = useState([]);
  const [form, setForm] = useState({ name: '', location: '', layout: 'main-side' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.screens
      .list()
      .then((rows) => setScreens(rows || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const created = await api.screens.create({
        name: form.name,
        location: form.location || null,
        layout: form.layout
      });
      setForm({ name: '', location: '', layout: 'main-side' });
      await load();
      onChange?.();
      if (created?.id) onEdit(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (id) => {
    try {
      await api.screens.duplicate(id);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Slette skjermen og alle dens slides?')) return;
    try {
      await api.screens.remove(id);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const layoutLabel = (v) => LAYOUT_OPTIONS.find((o) => o.value === v)?.label || v;

  return (
    <>
      <PageHeader crumbs={['Administrer', 'Skjermer']} />
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6 sm:p-8">
        <Card title="Ny skjerm">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-3">
            <Field label="Navn">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Hovedscene"
              />
            </Field>
            <Field label="Plassering">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Storsalen"
              />
            </Field>
            <Field label="Layout">
              <Select
                value={form.layout}
                onChange={(e) => setForm({ ...form, layout: e.target.value })}
              >
                {LAYOUT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={busy}>
                {busy ? 'Oppretter …' : 'Opprett og rediger'}
              </Button>
            </div>
          </form>
          <div className="mt-3">
            <ErrorText>{error}</ErrorText>
          </div>
        </Card>

        {screens.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-muted">
            Ingen skjermer opprettet.
          </p>
        ) : (
          <GroupCard label={`Skjermer · ${screens.length}`} icon="monitor">
            {screens.map((s) => (
              <Row
                key={s.id}
                media={
                  <MediaTile tone="brand">
                    <Icon name="monitor" className="h-5 w-5" />
                  </MediaTile>
                }
                title={
                  <span className="flex items-center gap-2">
                    <OnlineDot online={s.online} />
                    {s.name} <span className="font-normal text-muted">#{s.id}</span>
                  </span>
                }
                meta={
                  <>
                    <Icon name="layers" className="h-3.5 w-3.5" />
                    <span>{layoutLabel(s.layout)}</span>
                    <span>· {s.slide_count ?? 0} slides</span>
                    {s.location && <span>· {s.location}</span>}
                  </>
                }
                actions={
                  <>
                    <IconButton name="x" label="Slett" tone="danger" onClick={() => remove(s.id)} />
                    <IconButton name="copy" label="Dupliser" onClick={() => duplicate(s.id)} />
                    <a
                      href={`${origin}/display/${s.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink hover:bg-hair"
                    >
                      <Icon name="external" className="h-3.5 w-3.5" />
                      Åpne
                    </a>
                    <Button size="sm" variant="outline" onClick={() => onEdit(s.id)}>
                      Rediger
                    </Button>
                  </>
                }
              />
            ))}
          </GroupCard>
        )}
      </div>
    </>
  );
}

/* ============================ layout-velger ============================ */

function LayoutThumb({ layout }) {
  const zones = LANDSCAPE_PRESETS[layout] || LANDSCAPE_PRESETS['main-side'];
  return (
    <div className="relative h-14 w-24 rounded-md border border-line bg-paper">
      {zones.map((z) => (
        <div
          key={z.id}
          className="absolute rounded-[3px] border border-brand/40 bg-brand/15"
          style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
        />
      ))}
    </div>
  );
}

function LayoutPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {LAYOUT_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-semibold transition-colors ${
            value === o.value
              ? 'border-brand bg-brand-tint text-brand'
              : 'border-line bg-card text-muted hover:bg-hair'
          }`}
        >
          {o.value === 'custom' ? (
            <div className="grid h-14 w-24 place-items-center rounded-md border border-dashed border-line text-muted">
              <Icon name="layers" className="h-5 w-5" />
            </div>
          ) : (
            <LayoutThumb layout={o.value} />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CustomLayoutEditor({ zones, onChange }) {
  const setZone = (i, key, val) => {
    const next = zones.map((z, idx) => (idx === i ? { ...z, [key]: Number(val) } : z));
    onChange(next);
  };
  const addZone = () => {
    const id = String.fromCharCode(97 + zones.length);
    onChange([...zones, { id, x: 0, y: 0, w: 50, h: 50 }]);
  };
  const removeZone = (i) => onChange(zones.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-xl border border-hair bg-paper p-4">
      <div className="flex items-start gap-4">
        <div className="relative h-32 w-56 shrink-0 rounded-md border border-line bg-card">
          {zones.map((z) => (
            <div
              key={z.id}
              className="absolute grid place-items-center rounded-[3px] border border-brand/50 bg-brand/15 text-[10px] font-bold uppercase text-brand"
              style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
            >
              {z.id}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {zones.map((z, i) => (
            <div key={z.id} className="flex items-center gap-2">
              <span className="w-6 text-sm font-bold uppercase text-muted">{z.id}</span>
              {['x', 'y', 'w', 'h'].map((k) => (
                <label key={k} className="flex items-center gap-1 text-xs text-muted">
                  {k}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={z[k]}
                    onChange={(e) => setZone(i, k, e.target.value)}
                    className="w-14 rounded border border-line bg-white px-1.5 py-1 text-ink"
                  />
                </label>
              ))}
              <IconButton
                name="x"
                label="Fjern sone"
                tone="danger"
                onClick={() => removeZone(i)}
              />
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={addZone}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            Legg til sone
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Verdier i prosent av skjermen. Sonene kan overlappe – rekkefølgen bestemmer hva som ligger
        øverst.
      </p>
    </div>
  );
}

/* ============================ skjerm-editor ============================ */

const DEFAULT_CUSTOM = [
  { id: 'a', x: 0, y: 0, w: 62, h: 100 },
  { id: 'b', x: 62, y: 0, w: 38, h: 100 }
];

function SettingsCard({ screen, onSaved, onChange }) {
  const [form, setForm] = useState({
    name: screen.name,
    location: screen.location || '',
    layout: screen.layout,
    rotation_seconds: screen.rotation_seconds,
    custom_layout: Array.isArray(screen.custom_layout?.zones)
      ? screen.custom_layout.zones
      : Array.isArray(screen.custom_layout)
        ? screen.custom_layout
        : DEFAULT_CUSTOM
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setLayout = (layout) =>
    setForm((f) => ({
      ...f,
      layout,
      custom_layout: layout === 'custom' && !f.custom_layout?.length ? DEFAULT_CUSTOM : f.custom_layout
    }));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.screens.update(screen.id, {
        name: form.name,
        location: form.location || null,
        layout: form.layout,
        rotation_seconds: Number(form.rotation_seconds) || 15,
        custom_layout: form.layout === 'custom' ? { zones: form.custom_layout } : null
      });
      onSaved?.();
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Innstillinger">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Navn">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Plassering">
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </Field>
        <Field label="Standard varighet pr. slide (sek)">
          <Input
            type="number"
            min={4}
            value={form.rotation_seconds}
            onChange={(e) => setForm({ ...form, rotation_seconds: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Layout
        </div>
        <LayoutPicker value={form.layout} onChange={setLayout} />
      </div>

      {form.layout === 'custom' && (
        <div className="mt-4">
          <CustomLayoutEditor
            zones={form.custom_layout}
            onChange={(z) => setForm({ ...form, custom_layout: z })}
          />
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? 'Lagrer …' : 'Lagre innstillinger'}
        </Button>
        <ErrorText>{error}</ErrorText>
      </div>
    </Card>
  );
}

function SlideForm({ slide, categories, onSave, onCancel }) {
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

  const save = async () => {
    setBusy(true);
    try {
      await onSave({
        title: form.title || null,
        duration_seconds: Number(form.duration_seconds) || 15,
        enabled: form.enabled,
        config: form.config
      });
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
              <Select
                value={form.config.mode}
                onChange={(e) => setCfg({ mode: e.target.value })}
              >
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
                {categories.length === 0 && (
                  <span className="text-sm text-muted">Ingen kategorier opprettet.</span>
                )}
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
              <Field label="Bilde-URL">
                <Input
                  type="url"
                  value={form.config.url}
                  onChange={(e) => setCfg({ url: e.target.value })}
                  placeholder="https://…"
                />
              </Field>
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
      </div>

      <div className="mt-3 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-line text-brand"
          />
          Aktiv
        </label>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>
            Lukk
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? 'Lagrer …' : 'Lagre slide'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ZonePlaylist({ zone, slides, categories, onCreate, onUpdate, onDelete, onReorder }) {
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState('program');
  const list = slides
    .filter((s) => s.zone === zone)
    .sort((a, b) => a.position - b.position || a.id - b.id);

  return (
    <GroupCard
      label={`Sone ${zone.toUpperCase()} · ${list.length}`}
      icon="layers"
      right={
        <div className="flex items-center gap-1.5">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink"
          >
            {SLIDE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              const created = await onCreate(zone, adding);
              if (created?.id) setOpenId(created.id);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-brand px-2 py-1 text-xs font-bold uppercase tracking-wide text-white hover:bg-brand-dark"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            Legg til
          </button>
        </div>
      }
    >
      {list.length === 0 && (
        <div className="px-5 py-4 text-sm text-muted">Ingen slides i denne sonen.</div>
      )}
      {list.map((s, i) => (
        <div key={s.id}>
          <Row
            media={
              <MediaTile tone={s.enabled === 0 ? 'muted' : 'brand'}>
                <Icon name={SLIDE_TYPE_ICON[s.type] || 'layers'} className="h-5 w-5" />
              </MediaTile>
            }
            title={
              <span className={s.enabled === 0 ? 'text-muted line-through' : ''}>
                {s.title || SLIDE_TYPE_LABEL[s.type] || s.type}
              </span>
            }
            meta={
              <>
                <span>{SLIDE_TYPE_LABEL[s.type] || s.type}</span>
                <span>· {s.duration_seconds}s</span>
                {s.enabled === 0 && <span>· av</span>}
              </>
            }
            actions={
              <>
                <IconButton
                  name="up"
                  label="Flytt opp"
                  onClick={() => onReorder(list, i, -1)}
                  className={i === 0 ? 'pointer-events-none opacity-30' : ''}
                />
                <IconButton
                  name="down"
                  label="Flytt ned"
                  onClick={() => onReorder(list, i, 1)}
                  className={i === list.length - 1 ? 'pointer-events-none opacity-30' : ''}
                />
                <IconButton name="x" label="Slett" tone="danger" onClick={() => onDelete(s.id)} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenId(openId === s.id ? null : s.id)}
                >
                  {openId === s.id ? 'Lukk' : 'Endre'}
                </Button>
              </>
            }
          />
          {openId === s.id && (
            <SlideForm
              slide={s}
              categories={categories}
              onCancel={() => setOpenId(null)}
              onSave={async (patch) => {
                await onUpdate(s.id, patch);
                setOpenId(null);
              }}
            />
          )}
        </div>
      ))}
    </GroupCard>
  );
}

function ScreenEditor({ screenId, onBack, onChange }) {
  const [screen, setScreen] = useState(null);
  const [slides, setSlides] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const previewRef = useRef(null);

  const reloadScreen = () =>
    api.screens.list().then((rows) => {
      const found = (rows || []).find((s) => String(s.id) === String(screenId));
      if (found) setScreen(found);
    });
  const reloadSlides = () => api.slides.list(screenId).then((rows) => setSlides(rows || []));

  useEffect(() => {
    Promise.all([
      api.screens.list(),
      api.slides.list(screenId),
      api.categories.list()
    ])
      .then(([screens, sl, cats]) => {
        setScreen((screens || []).find((s) => String(s.id) === String(screenId)) || null);
        setSlides(sl || []);
        setCategories(cats || []);
      })
      .catch((e) => setError(e.message));
  }, [screenId]);

  const afterMutate = async () => {
    await Promise.all([reloadSlides(), reloadScreen()]);
    onChange?.();
  };

  const createSlide = async (zone, type) => {
    try {
      const created = await api.slides.create({
        screen_id: Number(screenId),
        zone,
        type,
        title: SLIDE_TYPE_LABEL[type],
        config: defaultConfig(type)
      });
      await afterMutate();
      return created;
    } catch (e) {
      setError(e.message);
      return null;
    }
  };

  const updateSlide = async (id, patch) => {
    try {
      await api.slides.update(id, patch);
      await afterMutate();
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteSlide = async (id) => {
    try {
      await api.slides.remove(id);
      await afterMutate();
    } catch (e) {
      setError(e.message);
    }
  };

  const reorder = async (list, index, dir) => {
    const target = list[index + dir];
    const self = list[index];
    if (!target || !self) return;
    try {
      await Promise.all([
        api.slides.update(self.id, { position: target.position }),
        api.slides.update(target.id, { position: self.position })
      ]);
      await afterMutate();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!screen) {
    return (
      <>
        <PageHeader crumbs={['Administrer', 'Skjermer', '…']} />
        <div className="p-8 text-muted">Laster …</div>
      </>
    );
  }

  const zones = zonesForScreen(screen);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <>
      <PageHeader
        crumbs={['Administrer', 'Skjermer', screen.name]}
        action={
          <div className="flex items-center gap-2">
            <a
              href={`${origin}/display/${screen.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-ink hover:bg-hair"
            >
              <Icon name="external" className="h-4 w-4" />
              Åpne skjerm
            </a>
            <Button variant="outline" onClick={onBack}>
              <Icon name="back" className="h-4 w-4" />
              Tilbake
            </Button>
          </div>
        }
      />

      <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <SettingsCard screen={screen} onSaved={reloadScreen} onChange={onChange} />
          {zones.map((z) => (
            <ZonePlaylist
              key={z}
              zone={z}
              slides={slides}
              categories={categories}
              onCreate={createSlide}
              onUpdate={updateSlide}
              onDelete={deleteSlide}
              onReorder={reorder}
            />
          ))}
          <ErrorText>{error}</ErrorText>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-hair bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-hair px-4 py-2">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
                Forhåndsvisning
              </span>
              <button
                onClick={() => {
                  if (previewRef.current) previewRef.current.src = previewRef.current.src;
                }}
                className="text-xs font-semibold text-brand hover:underline"
              >
                Oppdater
              </button>
            </div>
            <div className="aspect-video w-full bg-paper">
              <iframe
                ref={previewRef}
                title="Forhåndsvisning"
                src={`/display/${screen.id}`}
                className="h-full w-full"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Endringer vises live etter noen sekunder (samme sanntidskanal som ekte skjermer).
          </p>
        </div>
      </div>
    </>
  );
}

/* ============================ toppnivå ============================ */

const initialEdit = () => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('edit');
  return v && /^\d+$/.test(v) ? Number(v) : null;
};

export default function ScreensManager({ onChange }) {
  const [editingId, setEditingId] = useState(initialEdit);

  const setEdit = (id) => {
    setEditingId(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set('edit', id);
      else url.searchParams.delete('edit');
      window.history.replaceState(null, '', url);
    }
  };

  return editingId ? (
    <ScreenEditor screenId={editingId} onBack={() => setEdit(null)} onChange={onChange} />
  ) : (
    <ScreenList onEdit={setEdit} onChange={onChange} />
  );
}
