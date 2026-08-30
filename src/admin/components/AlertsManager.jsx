import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatTime } from '../../lib/time.js';
import { Field, Input, Select, Button, Card, ErrorText } from './ui.jsx';

export default function AlertsManager({ onChange }) {
  const [screens, setScreens] = useState([]);
  const [active, setActive] = useState([]);
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState(''); // '' = alle
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([api.screens.list(), api.alerts.list(false)])
      .then(([s, a]) => {
        setScreens(s || []);
        setActive(a || []);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const send = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setError('');
    setBusy(true);
    try {
      await api.alerts.create({
        message: message.trim(),
        target_screen_id: target ? Number(target) : null
      });
      setMessage('');
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (id) => {
    try {
      await api.alerts.dismiss(id);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const dismissAll = async () => {
    try {
      await api.alerts.dismissAll();
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const screenName = (id) =>
    screens.find((s) => String(s.id) === String(id))?.name || `#${id}`;

  return (
    <div className="space-y-6">
      <Card title="Send hastemelding">
        <form onSubmit={send} className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label="Melding">
              <Input
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Brannøvelse – forlat lokalet rolig."
              />
            </Field>
          </div>
          <Field label="Mål">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Alle skjermer</option>
              {screens.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" variant="danger" disabled={busy}>
              {busy ? 'Sender …' : 'Publiser nå'}
            </Button>
          </div>
        </form>
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>

      <Card
        title={`Aktive meldinger (${active.length})`}
        actions={
          active.length > 0 && (
            <Button variant="ghost" onClick={dismissAll}>
              Fjern alle
            </Button>
          )
        }
      >
        <ul className="divide-y divide-slate-800">
          {active.length === 0 && (
            <li className="py-3 text-slate-500">Ingen aktive meldinger.</li>
          )}
          {active.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold text-slate-100">{a.message}</div>
                <div className="text-sm text-slate-400">
                  {a.target_screen_id ? screenName(a.target_screen_id) : 'Alle skjermer'} ·{' '}
                  {formatTime(a.created_at)}
                </div>
              </div>
              <Button variant="ghost" onClick={() => dismiss(a.id)}>
                Fjern
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
