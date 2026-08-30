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
  MediaTile,
  NumberBadge,
  PageHeader,
  ErrorText
} from './ui.jsx';

const emptyForm = { name: '', location: '' };

export default function ScreensManager({ onChange }) {
  const [screens, setScreens] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  const load = () =>
    api.screens
      .list()
      .then((rows) => setScreens(rows || []))
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
  const startNew = () => {
    resetForm();
    focusForm();
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const payload = { name: form.name, location: form.location || null };
    try {
      if (editingId) await api.screens.update(editingId, payload);
      else await api.screens.create(payload);
      resetForm();
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (s) => {
    setEditingId(s.id);
    setError('');
    setForm({ name: s.name || '', location: s.location || '' });
    focusForm();
  };

  const remove = async (id) => {
    if (!confirm('Slette skjermen? Meldinger knyttet til den fjernes også.')) return;
    try {
      await api.screens.remove(id);
      if (editingId === id) resetForm();
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <>
      <PageHeader
        crumbs={['Administrer', 'Skjermer']}
        action={
          <Button onClick={startNew}>
            <Icon name="plus" className="h-4 w-4" />
            Ny skjerm
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-6 sm:p-8">
        <div ref={formRef}>
          <Card title={editingId ? 'Rediger skjerm' : 'Ny skjerm'}>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
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
              <div className="flex gap-3 sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Lagrer …' : editingId ? 'Lagre endringer' : 'Opprett skjerm'}
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

        {screens.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-muted">
            Ingen skjermer opprettet.
          </p>
        ) : (
          <GroupCard label={`Skjermer · ${screens.length}`} icon="monitor">
            {screens.map((s, i) => (
              <Row
                key={s.id}
                media={
                  <MediaTile tone="brand">
                    <Icon name="monitor" className="h-5 w-5" />
                  </MediaTile>
                }
                title={
                  <>
                    {s.name} <span className="font-normal text-muted">#{s.id}</span>
                  </>
                }
                meta={
                  <>
                    <Icon name="pin" className="h-3.5 w-3.5" />
                    <span>{s.location || 'Ingen plassering'}</span>
                    <span className="text-brand">
                      · {origin}/display/{s.id}
                    </span>
                  </>
                }
                actions={
                  <>
                    <IconButton name="x" label="Slett" tone="danger" onClick={() => remove(s.id)} />
                    <NumberBadge>{i + 1}</NumberBadge>
                    <a
                      href={`/display/${s.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-hair"
                    >
                      <Icon name="external" className="h-3.5 w-3.5" />
                      Åpne
                    </a>
                    <Button size="sm" variant="outline" onClick={() => edit(s)}>
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
