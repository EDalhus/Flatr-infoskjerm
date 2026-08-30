import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatTime } from '../../lib/time.js';
import {
  Icon,
  Field,
  Input,
  Select,
  Button,
  Card,
  GroupCard,
  Row,
  MediaTile,
  PageHeader,
  ErrorText
} from './ui.jsx';

export default function AlertsManager({ onChange }) {
  const [screens, setScreens] = useState([]);
  const [active, setActive] = useState([]);
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

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
    <>
      <PageHeader
        crumbs={['Administrer', 'Live Alerts']}
        action={
          <Button onClick={() => inputRef.current?.focus()}>
            <Icon name="plus" className="h-4 w-4" />
            Ny melding
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-6 sm:p-8">
        <Card title="Send hastemelding">
          <form onSubmit={send} className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Melding">
                <Input
                  ref={inputRef}
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
                <Icon name="megaphone" className="h-4 w-4" />
                {busy ? 'Sender …' : 'Publiser nå'}
              </Button>
            </div>
          </form>
          <div className="mt-3">
            <ErrorText>{error}</ErrorText>
          </div>
        </Card>

        {active.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-muted">
            Ingen aktive meldinger.
          </p>
        ) : (
          <GroupCard
            label={`Aktive meldinger · ${active.length}`}
            icon="megaphone"
            right={
              <button
                onClick={dismissAll}
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-zoneink/80 hover:text-zoneink"
              >
                Fjern alle
              </button>
            }
          >
            {active.map((a) => (
              <Row
                key={a.id}
                media={
                  <MediaTile tone="danger">
                    <Icon name="megaphone" className="h-5 w-5" />
                  </MediaTile>
                }
                title={a.message}
                meta={
                  <>
                    <Icon name="clock" className="h-3.5 w-3.5" />
                    <span>{formatTime(a.created_at)}</span>
                    <span>· {a.target_screen_id ? screenName(a.target_screen_id) : 'Alle skjermer'}</span>
                  </>
                }
                actions={
                  <Button size="sm" variant="outline" onClick={() => dismiss(a.id)}>
                    Fjern
                  </Button>
                }
              />
            ))}
          </GroupCard>
        )}
      </div>
    </>
  );
}
