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
  MetaValue,
  PageHeader,
  ErrorText
} from './ui.jsx';
import { MediaField } from './MediaPicker.jsx';

const emptyForm = { name: '', image_url: '', duration_seconds: 10 };

export default function SponsorsManager({ onChange }) {
  const [sponsors, setSponsors] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  const load = () =>
    api.sponsors
      .list()
      .then((rows) => setSponsors(rows || []))
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
    const payload = {
      name: form.name,
      image_url: form.image_url,
      duration_seconds: Number(form.duration_seconds) || 10
    };
    try {
      if (editingId) await api.sponsors.update(editingId, payload);
      else await api.sponsors.create(payload);
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
    setForm({
      name: s.name || '',
      image_url: s.image_url || '',
      duration_seconds: s.duration_seconds ?? 10
    });
    focusForm();
  };

  const remove = async (id) => {
    if (!confirm('Slette sponsoren?')) return;
    try {
      await api.sponsors.remove(id);
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
        crumbs={['Administrer', 'Sponsorer']}
        action={
          <Button onClick={startNew}>
            <Icon name="plus" className="h-4 w-4" />
            Ny sponsor
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-6 sm:p-8">
        <div ref={formRef}>
          <Card title={editingId ? 'Rediger sponsor' : 'Ny sponsor'}>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Navn">
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Acme AS"
                />
              </Field>
              <Field label="Visningsvarighet (sek)">
                <Input
                  type="number"
                  min={2}
                  value={form.duration_seconds}
                  onChange={(e) => setForm({ ...form, duration_seconds: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <MediaField
                  label="Logo / bilde"
                  value={form.image_url}
                  onChange={(url) => setForm({ ...form, image_url: url })}
                />
              </div>
              <div className="flex gap-3 sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Lagrer …' : editingId ? 'Lagre endringer' : 'Legg til sponsor'}
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

        {sponsors.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-muted">
            Ingen sponsorer ennå.
          </p>
        ) : (
          <GroupCard label={`Sponsorer · ${sponsors.length}`} icon="image">
            {sponsors.map((s, i) => (
              <Row
                key={s.id}
                media={<MediaTile src={s.image_url} alt={s.name} />}
                title={s.name}
                meta={
                  <>
                    <Icon name="clock" className="h-3.5 w-3.5" />
                    <span>Roterer hvert {s.duration_seconds}. sekund</span>
                  </>
                }
                actions={
                  <>
                    <IconButton name="x" label="Slett" tone="danger" onClick={() => remove(s.id)} />
                    <MetaValue>{s.duration_seconds} sek</MetaValue>
                    <NumberBadge>{i + 1}</NumberBadge>
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
