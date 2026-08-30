import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Field, Input, Button, Card, ErrorText } from './ui.jsx';

const emptyForm = { name: '', image_url: '', duration_seconds: 10 };

export default function SponsorsManager({ onChange }) {
  const [sponsors, setSponsors] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.sponsors
      .list()
      .then((rows) => setSponsors(rows || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.sponsors.create({
        name: form.name,
        image_url: form.image_url,
        duration_seconds: Number(form.duration_seconds) || 10
      });
      setForm(emptyForm);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Slette sponsoren?')) return;
    try {
      await api.sponsors.remove(id);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Ny sponsor">
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
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
            <Field label="Bilde-URL" hint="Direktelenke til logo/bilde (PNG, SVG, JPG).">
              <Input
                required
                type="url"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://…/logo.png"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Lagrer …' : 'Legg til sponsor'}
            </Button>
          </div>
        </form>
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>

      <Card title={`Sponsorer (${sponsors.length})`}>
        <ul className="grid gap-4 sm:grid-cols-2">
          {sponsors.length === 0 && (
            <li className="text-slate-500">Ingen sponsorer.</li>
          )}
          {sponsors.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900 p-3"
            >
              <img
                src={s.image_url}
                alt={s.name}
                className="h-14 w-24 shrink-0 rounded bg-white object-contain p-1"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-slate-100">{s.name}</div>
                <div className="text-sm text-slate-400">{s.duration_seconds}s</div>
              </div>
              <Button variant="danger" onClick={() => remove(s.id)}>
                Slett
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
