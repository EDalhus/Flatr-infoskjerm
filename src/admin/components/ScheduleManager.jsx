import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatTime, isoToLocalInput, localInputToIso } from '../../lib/time.js';
import { Field, Input, Textarea, Select, Button, Card, ErrorText } from './ui.jsx';

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Planlagt' },
  { value: 'live', label: 'Pågår' },
  { value: 'done', label: 'Ferdig' },
  { value: 'cancelled', label: 'Avlyst' }
];

const emptyForm = {
  title: '',
  description: '',
  start_time: '',
  end_time: '',
  stage: '',
  status: 'scheduled'
};

export default function ScheduleManager({ onChange }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.schedule
      .list()
      .then((rows) => setItems(rows || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
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
      status: form.status
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
    setForm({
      title: item.title || '',
      description: item.description || '',
      start_time: isoToLocalInput(item.start_time),
      end_time: isoToLocalInput(item.end_time),
      stage: item.stage || '',
      status: item.status || 'scheduled'
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    <div className="space-y-6">
      <Card title={editingId ? `Rediger post #${editingId}` : 'Ny programpost'}>
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
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
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
              <Button type="button" variant="ghost" onClick={resetForm}>
                Avbryt
              </Button>
            )}
          </div>
        </form>
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>

      <Card title={`Program (${items.length})`}>
        <ul className="divide-y divide-slate-800">
          {items.length === 0 && (
            <li className="py-3 text-slate-500">Ingen programposter.</li>
          )}
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-slate-400">
                    {formatTime(item.start_time)}
                    {item.end_time ? `–${formatTime(item.end_time)}` : ''}
                  </span>
                  <span className="font-semibold text-slate-100">{item.title}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs uppercase text-slate-400">
                    {item.status}
                  </span>
                </div>
                {item.stage && (
                  <div className="text-sm text-slate-400">{item.stage}</div>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" onClick={() => edit(item)}>
                  Rediger
                </Button>
                <Button variant="danger" onClick={() => remove(item.id)}>
                  Slett
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
