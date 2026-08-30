import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatTime, isoToLocalInput, localInputToIso } from '../../lib/time.js';
import {
  Icon,
  Field,
  Input,
  Textarea,
  Select,
  Button,
  IconButton,
  Card,
  GroupCard,
  Row,
  MediaTile,
  NumberBadge,
  MetaValue,
  PageHeader,
  ErrorText
} from './ui.jsx';

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Planlagt' },
  { value: 'live', label: 'Pågår' },
  { value: 'done', label: 'Ferdig' },
  { value: 'cancelled', label: 'Avlyst' }
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));
const STATUS_TILE = {
  live: { icon: 'play', tone: 'ok' },
  scheduled: { icon: 'clock', tone: 'brand' },
  done: { icon: 'check', tone: 'muted' },
  cancelled: { icon: 'x', tone: 'danger' }
};

const emptyForm = {
  title: '',
  description: '',
  start_time: '',
  end_time: '',
  stage: '',
  status: 'scheduled',
  auto_status: true,
  category_id: ''
};

const durationMin = (item) => {
  if (!item.end_time) return null;
  const d = (new Date(item.end_time) - new Date(item.start_time)) / 60000;
  return Number.isFinite(d) && d > 0 ? Math.round(d) : null;
};

export default function ScheduleManager({ onChange }) {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  const load = () =>
    Promise.all([api.schedule.list(), api.categories.list()])
      .then(([rows, cats]) => {
        setItems(rows || []);
        setCategories(cats || []);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const catMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories]
  );

  const groups = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = it.stage?.trim() || 'Uten scene';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nb'));
  }, [items]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
  };
  const focusForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const startNew = () => {
    resetForm();
    focusForm();
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const payload = {
      title: form.title,
      description: form.description || null,
      start_time: localInputToIso(form.start_time),
      end_time: form.end_time ? localInputToIso(form.end_time) : null,
      stage: form.stage || null,
      status: form.status,
      auto_status: form.auto_status,
      category_id: form.category_id ? Number(form.category_id) : null
    };
    try {
      if (editingId) await api.schedule.update(editingId, payload);
      else await api.schedule.create(payload);
      resetForm();
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (item) => {
    setEditingId(item.id);
    setError('');
    setForm({
      title: item.title || '',
      description: item.description || '',
      start_time: isoToLocalInput(item.start_time),
      end_time: isoToLocalInput(item.end_time),
      stage: item.stage || '',
      status: item.status || 'scheduled',
      auto_status: item.auto_status !== 0,
      category_id: item.category_id ? String(item.category_id) : ''
    });
    focusForm();
  };

  const remove = async (id) => {
    if (!confirm('Slette programposten?')) return;
    try {
      await api.schedule.remove(id);
      if (editingId === id) resetForm();
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader
        crumbs={['Administrer', 'Program']}
        action={
          <Button onClick={startNew}>
            <Icon name="plus" className="h-4 w-4" />
            Ny programpost
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-6 sm:p-8">
        <div ref={formRef}>
          <Card title={editingId ? 'Rediger programpost' : 'Ny programpost'}>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Tittel">
                <Input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Keynote"
                />
              </Field>
              <Field label="Scene / rom">
                <Input
                  value={form.stage}
                  onChange={(e) => setForm({ ...form, stage: e.target.value })}
                  placeholder="Hovedscene"
                />
              </Field>
              <Field label="Starttid">
                <Input
                  type="datetime-local"
                  required
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </Field>
              <Field label="Sluttid">
                <Input
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </Field>
              <Field label="Kategori">
                <Select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="">Ingen</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select
                  value={form.status}
                  disabled={form.auto_status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.auto_status}
                  onChange={(e) => setForm({ ...form, auto_status: e.target.checked })}
                  className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
                />
                Automatisk status – følg klokka (planlagt → pågår → ferdig)
              </label>
              <div className="sm:col-span-2">
                <Field label="Beskrivelse">
                  <Textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Field>
              </div>
              <div className="flex gap-3 sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Lagrer …' : editingId ? 'Lagre endringer' : 'Legg til'}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Avbryt
                  </Button>
                )}
              </div>
            </form>
            <div className="mt-3">
              <ErrorText>{error}</ErrorText>
            </div>
          </Card>
        </div>

        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-muted">
            Ingen programposter ennå. Legg til den første over.
          </p>
        )}

        {groups.map(([stage, rows]) => (
          <GroupCard key={stage} label={stage} icon="calendar">
            {rows.map((item, i) => {
              const status = item.effective_status || item.status;
              const tile = STATUS_TILE[status] || STATUS_TILE.scheduled;
              const mins = durationMin(item);
              const category = catMap[item.category_id];
              return (
                <Row
                  key={item.id}
                  highlight={status === 'live'}
                  media={
                    <MediaTile tone={tile.tone}>
                      <Icon name={tile.icon} className="h-5 w-5" />
                    </MediaTile>
                  }
                  title={item.title}
                  meta={
                    <>
                      <Icon name="clock" className="h-3.5 w-3.5" />
                      <span>
                        {formatTime(item.start_time)}
                        {item.end_time ? `–${formatTime(item.end_time)}` : ''}
                      </span>
                      <span>· {STATUS_LABEL[status] || status}</span>
                      {item.auto_status !== 0 && <span className="text-muted/70">· auto</span>}
                      {category && (
                        <span
                          className="ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
                          style={{ backgroundColor: `${category.color}1f`, color: category.color }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          {category.name}
                        </span>
                      )}
                    </>
                  }
                  actions={
                    <>
                      <IconButton
                        name="x"
                        label="Slett"
                        tone="danger"
                        onClick={() => remove(item.id)}
                      />
                      {mins != null && <MetaValue>{mins} min</MetaValue>}
                      <NumberBadge>{i + 1}</NumberBadge>
                      <Button size="sm" variant="outline" onClick={() => edit(item)}>
                        Endre
                      </Button>
                    </>
                  }
                />
              );
            })}
          </GroupCard>
        ))}
      </div>
    </>
  );
}
