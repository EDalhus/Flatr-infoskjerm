import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Field, Input, Button, Card, ErrorText } from './ui.jsx';

export default function ScreensManager({ onChange }) {
  const [screens, setScreens] = useState([]);
  const [form, setForm] = useState({ name: '', location: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.screens
      .list()
      .then((rows) => setScreens(rows || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.screens.create({ name: form.name, location: form.location || null });
      setForm({ name: '', location: '' });
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Slette skjermen? Meldinger som er knyttet til den fjernes også.')) return;
    setError('');
    try {
      await api.screens.remove(id);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-6">
      <Card title="Ny skjerm">
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
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
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Lagrer …' : 'Opprett skjerm'}
            </Button>
          </div>
        </form>
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>

      <Card title={`Skjermer (${screens.length})`}>
        <ul className="divide-y divide-slate-800">
          {screens.length === 0 && (
            <li className="py-3 text-slate-500">Ingen skjermer opprettet.</li>
          )}
          {screens.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold text-slate-100">
                  {s.name}{' '}
                  <span className="text-sm font-normal text-slate-500">#{s.id}</span>
                </div>
                {s.location && (
                  <div className="text-sm text-slate-400">{s.location}</div>
                )}
                <a
                  href={`/display/${s.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-sky-400 hover:underline"
                >
                  {origin}/display/{s.id}
                </a>
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
