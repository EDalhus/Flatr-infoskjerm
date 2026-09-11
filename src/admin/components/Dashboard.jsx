// Hjemmeside / dashboard – oversikt over alle parede skjermer, nøkkeltall
// og en hurtigvei for å sende en hastemelding live til alle skjermer.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Button, Input, PageHeader, ErrorText } from './ui.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import { displayName, deviceStatus } from './pairingHelpers.js';

const LAST_DEVICE_KEY = 'flatr.pairing.lastDevice';

function StatCard({ icon, label, value, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-tint text-brand',
    ok: 'bg-ok-tint text-ok',
    danger: 'bg-danger-tint text-danger',
    muted: 'bg-hair text-muted'
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-hair bg-card p-4 shadow-card">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-black leading-none text-ink">{value}</div>
        <div className="mt-1 truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          {label}
        </div>
      </div>
    </div>
  );
}

function DeviceCard({ p, screens, onOpen }) {
  const screen = screens.find((s) => s.id === p.screen_id);
  const orientation = screen?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const status = deviceStatus(p);
  return (
    <button
      type="button"
      onClick={() => onOpen(p.device_id)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-hair bg-card text-left shadow-card transition-shadow hover:shadow-pop"
    >
      {p.screen_id ? (
        <LiveScreenView screenId={p.screen_id} orientation={orientation} />
      ) : (
        <div className="grid aspect-video place-items-center bg-black text-xs text-white/50">
          Ingen kanal
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-3">
        <span className={`h-2 w-2 shrink-0 rounded-full ${p.online ? 'bg-ok' : 'bg-muted/50'}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink">{displayName(p)}</div>
          <div className="truncate text-xs text-muted">{p.screen_name || 'Ingen kanal'}</div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.cls}`}
        >
          {status.label}
        </span>
      </div>
    </button>
  );
}

export default function Dashboard({ onChange, onNavigate }) {
  const [pairings, setPairings] = useState([]);
  const [screens, setScreens] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    Promise.all([api.pairing.list(), api.screens.list(), api.alerts.list(false)])
      .then(([p, s, a]) => {
        setPairings(p || []);
        setScreens(s || []);
        setActiveAlerts(a || []);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const paired = useMemo(() => pairings.filter((p) => p.status === 'paired'), [pairings]);
  const pending = useMemo(() => pairings.filter((p) => p.status === 'pending'), [pairings]);
  const liveNow = useMemo(() => paired.filter((p) => p.online).length, [paired]);

  const openDevice = (deviceId) => {
    try {
      localStorage.setItem(LAST_DEVICE_KEY, deviceId);
    } catch {
      /* ignore */
    }
    onNavigate ? onNavigate('pairing') : (window.location.href = '/admin?view=pairing');
  };

  const sendAlert = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setError('');
    setBusy(true);
    try {
      await api.alerts.create({ message: message.trim(), target_screen_id: null });
      setMessage('');
      setSent(true);
      setTimeout(() => setSent(false), 2500);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader crumbs={['Oversikt', 'Hjem']} />
      <div className="mx-auto w-full max-w-6xl space-y-6 p-6 sm:p-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon="monitor" label="Skjermer paret" value={paired.length} tone="brand" />
          <StatCard icon="layers" label="Kanaler" value={screens.length} tone="muted" />
          <StatCard icon="play" label="Live nå" value={liveNow} tone="ok" />
          <StatCard icon="megaphone" label="Aktive varsler" value={activeAlerts.length} tone="danger" />
        </div>

        <form
          onSubmit={sendAlert}
          className="flex flex-col gap-3 rounded-2xl border border-hair bg-card p-4 shadow-card sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Icon name="megaphone" className="h-4 w-4 shrink-0 text-danger" />
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Skriv en hastemelding til alle skjermer …"
            />
          </div>
          <Button type="submit" variant="danger" disabled={busy} className="shrink-0">
            {busy ? 'Sender …' : sent ? 'Sendt' : 'Send til alle'}
          </Button>
        </form>
        <ErrorText>{error}</ErrorText>

        {paired.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-muted">
            Ingen skjermer paret ennå.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paired.map((p) => (
              <DeviceCard key={p.id} p={p} screens={screens} onOpen={openDevice} />
            ))}
          </div>
        )}

        {pending.length > 0 && (
          <p className="text-center text-xs text-muted">
            {pending.length} enhet{pending.length === 1 ? '' : 'er'} venter på parring ·{' '}
            <button
              type="button"
              onClick={() => (onNavigate ? onNavigate('pairing') : (window.location.href = '/admin?view=pairing'))}
              className="font-semibold text-brand hover:underline"
            >
              Gå til Parring
            </button>
          </p>
        )}
      </div>
    </>
  );
}
