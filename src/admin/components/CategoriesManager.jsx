import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import {
  Icon,
  Field,
  Input,
  Button,
  IconButton,
  Card,
  GroupCard,
  Row,
  PageHeader,
  ErrorText
} from './ui.jsx';

const PRESET_COLORS = [
  '#1f5566',
  '#9333ea',
  '#c2410c',
  '#15803d',
  '#b91c1c',
  '#0369a1',
  '#a16207',
  '#4338ca'
];
const emptyForm = { name: '', color: PRESET_COLORS[0] };

export default function CategoriesManager({ onChange }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  const load = () =>
    api.categories
      .list()
      .then((rows) => setItems(rows || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
  };
  const focusForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (editingId) await api.categories.update(editingId, form);
      else await api.categories.create(form);
      resetForm();
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (c) => {
    setEditingId(c.id);
    setForm({ name: c.name, color: c.color });
    focusForm();
  };

  const remove = async (id) => {
    if (!confirm('Slette kategorien? Programposter beholdes, men mister kategorien.')) return;
    try {
      await api.categories.remove(id);
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
        crumbs={['Administrer', 'Kategorier']}
        action={
          <Button onClick={() => { resetForm(); focusForm(); }}>
            <Icon name="plus" className="h-4 w-4" />
            Ny kategori
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-6 sm:p-8">
        <div ref={formRef}>
          <Card title={editingId ? 'Rediger kategori' : 'Ny kategori'}>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Navn">
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Verksted"
                />
              </Field>
              <Field label="Farge">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-line bg-white"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setForm({ ...form, color: c })}
                        className={`h-7 w-7 rounded-full border-2 ${
                          form.color.toLowerCase() === c ? 'border-ink' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </div>
              </Field>
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

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-muted">
            Ingen kategorier ennå.
          </p>
        ) : (
          <GroupCard label={`Kategorier · ${items.length}`} icon="tag">
            {items.map((c) => (
              <Row
                key={c.id}
                media={
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-md"
                    style={{ backgroundColor: `${c.color}1f` }}
                  >
                    <span
                      className="h-5 w-5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                  </span>
                }
                title={c.name}
                meta={<span className="font-mono">{c.color}</span>}
                actions={
                  <>
                    <IconButton name="x" label="Slett" tone="danger" onClick={() => remove(c.id)} />
                    <Button size="sm" variant="outline" onClick={() => edit(c)}>
                      Endre
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
