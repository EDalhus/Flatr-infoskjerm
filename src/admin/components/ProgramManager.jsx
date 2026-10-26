// Program – programposter og kategorier på én side.
//
// Kategoriene er fargede merkelapper øverst (filtrer, lag ny, endre). Postene
// grupperes pr. dag og redigeres direkte i lista. Status (pågår/ferdig) regnes
// ut automatisk fra klokka; «Avlyst» settes for hånd.

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Input, Textarea, Button, IconButton, PageHeader, ErrorText } from './ui.jsx';

const COLORS = ['#027353', '#3e63dd', '#c2410c', '#8e4ec6', '#0d9488', '#b91c1c', '#a16207', '#d6409f', '#475569'];

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const timeOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIso = (date, time) => (date && time ? new Date(`${date}T${time}`).toISOString() : null);
const dayLabel = (key) => {
  const d = new Date(`${key}T12:00`);
  const today = dateKey(new Date().toISOString());
  const tomorrow = dateKey(new Date(Date.now() + 86_400_000).toISOString());
  const base = d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
  const cap = base.charAt(0).toUpperCase() + base.slice(1);
  return key === today ? `I dag · ${cap}` : key === tomorrow ? `I morgen · ${cap}` : cap;
};

const STATUS = {
  live: { label: 'Pågår', cls: 'bg-ok-tint text-ok' },
  scheduled: { label: 'Kommer', cls: 'bg-zone text-muted' },
  done: { label: 'Ferdig', cls: 'bg-zone text-muted' },
  cancelled: { label: 'Avlyst', cls: 'bg-danger-tint text-danger' }
};

/* ------------------------------ kategorier ------------------------------ */

function CategoryEditor({ initial, onSave, onDelete, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || COLORS[0]);
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave({ name: name.trim(), color });
      }}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-3 shadow-pop"
    >
      <Input ref={ref} value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn, f.eks. Foredrag" className="!w-48" />
      <div className="flex gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Farge ${c}`}
            aria-pressed={color === c}
            className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-card' : ''}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <Button type="submit" size="sm" disabled={!name.trim()}>
        {initial ? 'Lagre' : 'Legg til'}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onCancel}>
        Avbryt
      </Button>
      {onDelete && (
        <button type="button" onClick={onDelete} className="ml-1 text-sm font-semibold text-danger hover:underline">
          Slett
        </button>
      )}
    </form>
  );
}

/* --------------------------------- post ---------------------------------- */

function ItemForm({ initial, categories, onSave, onCancel, onDelete }) {
  const [f, setF] = useState(() => ({
    title: initial.title || '',
    date: initial.start_time ? dateKey(initial.start_time) : initial.date,
    from: initial.start_time ? timeOf(initial.start_time) : initial.from || '10:00',
    to: initial.end_time ? timeOf(initial.end_time) : initial.to || '',
    stage: initial.stage || '',
    category_id: initial.category_id ?? null,
    description: initial.description || '',
    cancelled: initial.status === 'cancelled'
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const titleRef = useRef(null);
  useEffect(() => titleRef.current?.focus(), []);

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return setError('Skriv inn en tittel.');
    if (f.to && f.to <= f.from) return setError('Slutt må være etter start.');
    setBusy(true);
    setError('');
    try {
      await onSave({
        title: f.title.trim(),
        start_time: toIso(f.date, f.from),
        end_time: f.to ? toIso(f.date, f.to) : null,
        stage: f.stage.trim() || null,
        category_id: f.category_id,
        description: f.description.trim() || null,
        status: f.cancelled ? 'cancelled' : 'scheduled',
        auto_status: true
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      className="space-y-4 rounded-2xl border-2 border-brand/40 bg-card p-4 shadow-pop"
    >
      <Input ref={titleRef} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Tittel, f.eks. Åpning og velkommen" className="!h-11 !text-base font-semibold" />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Dato</span>
          <Input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} className="!w-40" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Fra</span>
          <Input type="time" value={f.from} onChange={(e) => set({ from: e.target.value })} className="!w-28" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Til (valgfritt)</span>
          <Input type="time" value={f.to} onChange={(e) => set({ to: e.target.value })} className="!w-28" />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Sted / scene</span>
          <Input value={f.stage} onChange={(e) => set({ stage: e.target.value })} placeholder="Hovedscenen" />
        </label>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-muted">Kategori</span>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => set({ category_id: f.category_id === c.id ? null : c.id })}
              aria-pressed={f.category_id === c.id}
              className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${
                f.category_id === c.id ? 'border-transparent text-white' : 'border-line bg-paper text-ink hover:bg-zone'
              }`}
              style={f.category_id === c.id ? { background: c.color } : undefined}
            >
              {f.category_id !== c.id && <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />}
              {c.name}
            </button>
          ))}
        </div>
      )}

      <Textarea value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Beskrivelse (valgfritt)" rows={2} />

      <ErrorText>{error}</ErrorText>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Lagrer …' : 'Lagre'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Avbryt
        </Button>
        <label className="ml-2 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={f.cancelled} onChange={(e) => set({ cancelled: e.target.checked })} />
          Avlyst
        </label>
        {onDelete && (
          <button type="button" onClick={onDelete} className="ml-auto text-sm font-semibold text-danger hover:underline">
            Slett
          </button>
        )}
      </div>
    </form>
  );
}

function ItemRow({ item, category, onEdit, onDuplicate }) {
  const st = STATUS[item.effective_status] || STATUS.scheduled;
  return (
    <div className={`group flex items-stretch gap-3 rounded-2xl border border-hair bg-card transition-shadow hover:shadow-card ${item.effective_status === 'done' ? 'opacity-60' : ''}`}>
      <span className="w-1.5 shrink-0 rounded-l-2xl" style={{ background: category?.color || 'transparent' }} aria-hidden="true" />
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-4 py-3 text-left">
        <span className="w-24 shrink-0 tabular-nums">
          <span className="block font-bold text-ink">{timeOf(item.start_time)}</span>
          {item.end_time && <span className="block text-xs text-muted">– {timeOf(item.end_time)}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-semibold text-ink ${item.effective_status === 'cancelled' ? 'line-through' : ''}`}>{item.title}</span>
          <span className="block truncate text-sm text-muted">
            {[category?.name, item.stage].filter(Boolean).join(' · ') || ' '}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
      </button>
      <div className="flex shrink-0 items-center pr-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <IconButton name="copy" label="Dupliser" onClick={onDuplicate} />
      </div>
    </div>
  );
}

/* ---------------------------------- side ---------------------------------- */

export default function ProgramManager({ onChange }) {
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [catFilter, setCatFilter] = useState(null);
  const [day, setDay] = useState('all');
  const [editing, setEditing] = useState(null); // id | { new: true, date, from }
  const [catEdit, setCatEdit] = useState(null); // 'new' | kategori
  const [error, setError] = useState('');

  const load = () =>
    Promise.all([api.schedule.list(), api.categories.list()])
      .then(([rows, cats]) => {
        setItems(rows || []);
        setCategories(cats || []);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // status (pågår/ferdig) følger klokka
    return () => clearInterval(t);
  }, []);

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  const days = useMemo(() => {
    const map = new Map();
    for (const it of [...(items || [])].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
      const k = dateKey(it.start_time);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return [...map.entries()];
  }, [items]);

  const shownDays = days
    .filter(([k]) => day === 'all' || k === day)
    .map(([k, list]) => [k, list.filter((it) => !catFilter || it.category_id === catFilter)])
    .filter(([, list]) => list.length || day !== 'all');

  const save = async (body) => {
    if (editing && typeof editing === 'object') await api.schedule.create(body);
    else await api.schedule.update(editing, body);
    setEditing(null);
    await load();
    onChange?.();
  };

  const remove = async (id) => {
    if (!confirm('Slette programposten? Den havner i «Nylig slettet».')) return;
    await api.schedule.remove(id);
    setEditing(null);
    await load();
    onChange?.();
  };

  const duplicate = async (it) => {
    const { id, effective_status, ...rest } = it;
    await api.schedule.create({ ...rest, title: `${it.title} (kopi)` });
    await load();
  };

  const startNew = (dateK) => {
    const list = days.find(([k]) => k === dateK)?.[1] || [];
    const last = list.at(-1);
    const from = last ? timeOf(last.end_time || last.start_time) : '10:00';
    setEditing({ new: true, date: dateK, from });
  };

  const saveCategory = async (body) => {
    try {
      if (catEdit === 'new') await api.categories.create(body);
      else await api.categories.update(catEdit.id, body);
      setCatEdit(null);
      await load();
      onChange?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteCategory = async (c) => {
    if (!confirm(`Slette kategorien «${c.name}»? Postene beholdes, men mister kategorien.`)) return;
    await api.categories.remove(c.id);
    if (catFilter === c.id) setCatFilter(null);
    setCatEdit(null);
    await load();
    onChange?.();
  };

  const today = dateKey(new Date().toISOString());
  const newForm = editing && typeof editing === 'object';

  return (
    <>
      <PageHeader
        title="Program"
        subtitle="Vises med program-widgeten på skjermene og på den offentlige programsiden. Status oppdateres automatisk."
        action={
          <Button onClick={() => startNew(day !== 'all' ? day : days.find(([k]) => k >= today)?.[0] || today)}>
            <Icon name="plus" className="h-4 w-4" />
            Ny programpost
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-5 px-6 pb-16 pt-4 sm:px-8">
        <ErrorText>{error}</ErrorText>

        {/* kategorier */}
        <section className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCatFilter(null)}
            aria-pressed={!catFilter}
            className={`h-9 rounded-full px-4 text-sm font-semibold ${!catFilter ? 'bg-ink text-paper' : 'border border-line bg-card text-muted hover:text-ink'}`}
          >
            Alle kategorier
          </button>
          {categories.map((c) => (
            <span key={c.id} className="group relative flex items-center">
              <button
                type="button"
                onClick={() => setCatFilter(catFilter === c.id ? null : c.id)}
                aria-pressed={catFilter === c.id}
                className={`flex h-9 items-center gap-2 rounded-full border pl-3 pr-9 text-sm font-semibold transition-colors ${
                  catFilter === c.id ? 'border-transparent text-white' : 'border-line bg-card text-ink hover:bg-zone'
                }`}
                style={catFilter === c.id ? { background: c.color } : undefined}
              >
                {catFilter !== c.id && <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />}
                {c.name}
              </button>
              <button
                type="button"
                onClick={() => setCatEdit(c)}
                aria-label={`Endre ${c.name}`}
                title="Endre kategori"
                className={`absolute right-1.5 grid h-6 w-6 place-items-center rounded-full ${catFilter === c.id ? 'text-white hover:bg-white/20' : 'text-muted hover:bg-hair hover:text-ink'}`}
              >
                <Icon name="edit" className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setCatEdit('new')}
            className="flex h-9 items-center gap-1.5 rounded-full border border-dashed border-line px-3 text-sm font-semibold text-brand hover:bg-brand-tint"
          >
            <Icon name="plus" className="h-4 w-4" />
            Kategori
          </button>
        </section>
        {catEdit && (
          <CategoryEditor
            key={catEdit === 'new' ? 'new' : catEdit.id}
            initial={catEdit === 'new' ? null : catEdit}
            onSave={saveCategory}
            onCancel={() => setCatEdit(null)}
            onDelete={catEdit !== 'new' ? () => deleteCategory(catEdit) : null}
          />
        )}

        {/* dager */}
        {days.length > 1 && (
          <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-zone p-1" aria-label="Dager">
            {[['all', 'Alle dager'], ...days.map(([k]) => [k, new Date(`${k}T12:00`).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })])].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setDay(k)}
                aria-pressed={day === k}
                className={`h-9 shrink-0 rounded-xl px-4 text-sm font-semibold capitalize ${day === k ? 'bg-card text-ink shadow-card' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        {newForm && !days.some(([k]) => k === editing.date) && (
          <ItemForm initial={editing} categories={categories} onSave={save} onCancel={() => setEditing(null)} />
        )}

        {items && items.length === 0 && !newForm && (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-card px-6 py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-tint text-brand">
              <Icon name="calendar" className="h-7 w-7" />
            </span>
            <h2 className="m-0 text-xl font-bold text-ink">Ingen programposter ennå</h2>
            <p className="m-0 max-w-md text-sm text-muted">Legg inn programmet én gang – skjermene viser hva som skjer nå og hva som kommer.</p>
            <Button onClick={() => startNew(today)}>Legg til første post</Button>
          </div>
        )}

        {shownDays.map(([k, list]) => (
          <section key={k} className="space-y-2">
            <h2 className="m-0 pt-2 text-base font-bold text-ink">{dayLabel(k)}</h2>
            {list.map((it) =>
              editing === it.id ? (
                <ItemForm
                  key={it.id}
                  initial={it}
                  categories={categories}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                  onDelete={() => remove(it.id)}
                />
              ) : (
                <ItemRow key={it.id} item={it} category={catMap[it.category_id]} onEdit={() => setEditing(it.id)} onDuplicate={() => duplicate(it)} />
              )
            )}
            {newForm && editing.date === k ? (
              <ItemForm initial={editing} categories={categories} onSave={save} onCancel={() => setEditing(null)} />
            ) : (
              <button
                type="button"
                onClick={() => startNew(k)}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-2.5 text-sm font-semibold text-brand hover:bg-brand-tint"
              >
                <Icon name="plus" className="h-4 w-4" />
                Legg til
              </button>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
