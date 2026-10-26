// Hjem – «Skjermene dine»: status for alle parede skjermer, hva de viser,
// og snarveier for å sende et varsel eller koble til en ny skjerm.
// Visningen er kort (standard i Varm) eller tabell (standard i Presis).

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Button, Input, Select, PageHeader, ErrorText } from './ui.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import { displayName, timeAgo } from './pairingHelpers.js';

const LAST_DEVICE_KEY = 'flatr.pairing.lastDevice';
const VIEW_KEY = 'flatr.dashboard.view';

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 5 ? 'God natt' : h < 10 ? 'God morgen' : h < 17 ? 'Hei' : 'God kveld';
  const first = (name || '').split(/[\s.@]/)[0];
  return first ? `${part}, ${first.charAt(0).toUpperCase()}${first.slice(1)}` : part;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function SummaryCard({ tone, label, value, sub }) {
  const tones = {
    brand: 'bg-brand text-onbrand',
    warn: 'bg-warn-tint text-warn',
    plain: 'border border-line bg-card text-ink'
  };
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-2xl p-5 ${tones[tone]}`}>
      <span className="text-sm font-semibold opacity-90">{label}</span>
      <span className="truncate text-[2rem] font-extrabold leading-tight tracking-tight tabular-nums">{value}</span>
      <span className="truncate text-sm opacity-90">{sub}</span>
    </div>
  );
}

function StatusBadge({ online }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
        online ? 'bg-ok-tint text-ok' : 'bg-warn-tint text-warn'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-ok' : 'bg-warn'}`} aria-hidden="true" />
      {online ? 'På' : 'Av'}
    </span>
  );
}

function Preview({ p, orientation }) {
  if (!p.screen_id) {
    return <div className="grid aspect-video place-items-center rounded-xl bg-zone text-sm text-muted">Ingen skjerm</div>;
  }
  return <LiveScreenView screenId={p.screen_id} orientation={orientation} />;
}

function DeviceCard({ p, orientation, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(p.device_id)}
      className="group flex flex-col gap-3 rounded-2xl border border-hair bg-card p-2.5 text-left shadow-card transition-shadow hover:shadow-pop"
    >
      <div className={p.online ? '' : 'opacity-60 grayscale'}>
        <Preview p={p} orientation={orientation} />
      </div>
      <div className="flex flex-col gap-1 px-1.5 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-bold text-ink">{displayName(p)}</span>
          <StatusBadge online={p.online} />
        </div>
        <span className="truncate text-sm text-muted">
          {p.screen_name ? `Viser «${p.screen_name}»` : 'Ingen skjerm valgt'}
          {!p.online && p.last_seen && ` · sist sett ${timeAgo(p.last_seen)}`}
        </span>
      </div>
    </button>
  );
}

function DeviceTable({ rows, orientationOf, onOpen }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-zone text-left text-xs text-muted">
            <th className="px-4 py-2.5 font-medium">Skjerm</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Viser</th>
            <th className="px-4 py-2.5 font-medium">Spiller</th>
            <th className="px-4 py-2.5 text-right font-medium">Sist sett</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              onClick={() => onOpen(p.device_id)}
              className="cursor-pointer border-t border-hair bg-card transition-colors hover:bg-zone"
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div className={`w-16 shrink-0 ${p.online ? '' : 'opacity-60 grayscale'}`}>
                    <Preview p={p} orientation={orientationOf(p)} />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(p.device_id);
                    }}
                    className="truncate text-left font-medium text-ink hover:underline"
                  >
                    {displayName(p)}
                  </button>
                </div>
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge online={p.online} />
              </td>
              <td className="px-4 py-2.5 text-ink/80">{p.screen_name || '–'}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-muted">
                {p.client_info?.model || p.client_info?.device_name || 'Nettleser'}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-xs text-muted">
                {p.online ? 'nå' : timeAgo(p.last_seen)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ViewToggle({ view, setView }) {
  const opt = (id, label) => (
    <button
      type="button"
      onClick={() => setView(id)}
      aria-pressed={view === id}
      className={`h-8 rounded-lg px-3 text-xs font-semibold transition-colors ${
        view === id ? 'bg-card text-ink shadow-card' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex rounded-xl bg-zone p-1">
      {opt('cards', 'Kort')}
      {opt('table', 'Tabell')}
    </div>
  );
}

function EmptyState({ onPair, onChannels }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line bg-card px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-tint text-brand">
        <Icon name="monitor" className="h-7 w-7" />
      </div>
      <div className="max-w-md">
        <h2 className="m-0 text-xl font-bold text-ink">Koble til din første TV</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Åpne Flatr-appen på en Apple TV og tast inn koden som vises, eller åpne lenken til en skjerm i nettleseren på
          skjermen.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onPair}>Koble til TV</Button>
        <Button variant="outline" onClick={onChannels}>
          Se skjermene
        </Button>
      </div>
    </div>
  );
}

export default function Dashboard({ onChange, onNavigate, me, theme }) {
  const [pairings, setPairings] = useState([]);
  const [screens, setScreens] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [composer, setComposer] = useState(false);
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [view, setViewState] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || null;
    } catch {
      return null;
    }
  });
  const effectiveView = view || (theme === 'presis' ? 'table' : 'cards');
  const setView = (v) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

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

  const go = (id) => (onNavigate ? onNavigate(id) : (window.location.href = `/admin?view=${id}`));

  const paired = useMemo(
    () =>
      pairings
        .filter((p) => p.status === 'paired')
        .sort((a, b) => Number(a.online) - Number(b.online) || displayName(a).localeCompare(displayName(b))),
    [pairings]
  );
  const pending = pairings.filter((p) => p.status === 'pending');
  const online = paired.filter((p) => p.online);
  const offline = paired.filter((p) => !p.online);

  const channelFilters = useMemo(() => {
    const names = [...new Set(paired.map((p) => p.screen_name).filter(Boolean))];
    return names.length > 1 ? names : [];
  }, [paired]);
  const visible = filter === 'all' ? paired : paired.filter((p) => p.screen_name === filter);

  const orientationOf = (p) =>
    screens.find((s) => s.id === p.screen_id)?.orientation === 'portrait' ? 'portrait' : 'landscape';

  const openDevice = (deviceId) => {
    try {
      localStorage.setItem(LAST_DEVICE_KEY, deviceId);
    } catch {
      /* ignore */
    }
    go('pairing');
  };

  const dismissAlert = async (id) => {
    try {
      if (id) await api.alerts.dismiss(id);
      else await api.alerts.dismissAll();
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const sendAlert = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setError('');
    setBusy(true);
    try {
      await api.alerts.create({ message: message.trim(), target_screen_id: target ? Number(target) : null });
      setMessage('');
      setSent(true);
      setTimeout(() => {
        setSent(false);
        setComposer(false);
      }, 1800);
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
      <PageHeader
        eyebrow={greeting(me?.name)}
        title="Oversikt"
        action={
          <>
            <Button variant="outline" onClick={() => setComposer((v) => !v)} aria-expanded={composer}>
              <Icon name="megaphone" className="h-4 w-4" />
              Send et varsel
            </Button>
            <Button onClick={() => go('pairing')}>
              <Icon name="plus" className="h-4 w-4" />
              Koble til TV
            </Button>
          </>
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 pb-12 pt-4 sm:px-8">
        {composer && (
          <form
            onSubmit={sendAlert}
            className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 shadow-card sm:flex-row sm:items-center"
          >
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <Icon name="megaphone" className="h-4 w-4 shrink-0 text-danger" />
              <span className="sr-only">Varsel til alle skjermer</span>
              <Input
                autoFocus
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Skriv en melding, f.eks. «Brannøvelse – forlat lokalet rolig.»"
              />
            </label>
            <label className="shrink-0">
              <span className="sr-only">Hvilke skjermer</span>
              <Select value={target} onChange={(e) => setTarget(e.target.value)} className="!w-48">
                <option value="">Alle skjermer</option>
                {screens.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="danger" disabled={busy || !message.trim()} className="shrink-0">
              {busy ? 'Sender …' : sent ? 'Sendt ✓' : 'Send nå'}
            </Button>
          </form>
        )}
        <ErrorText>{error}</ErrorText>

        {activeAlerts.length > 0 && (
          <section className="rounded-2xl border border-danger/30 bg-danger-tint/40 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Icon name="megaphone" className="h-4 w-4 text-danger" />
              <h2 className="m-0 flex-1 text-sm font-bold text-ink">Vises på skjermene nå</h2>
              {activeAlerts.length > 1 && (
                <button type="button" onClick={() => dismissAlert(null)} className="text-sm font-semibold text-danger hover:underline">
                  Avslutt alle
                </button>
              )}
            </div>
            <ul className="m-0 list-none space-y-1.5 p-0">
              {activeAlerts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{a.message}</span>
                    <span className="block text-xs text-muted">
                      {a.target_screen_id ? screens.find((s) => s.id === a.target_screen_id)?.name || 'Én skjerm' : 'Alle skjermer'}
                      {a.created_at ? ` · sendt ${timeAgo(a.created_at)}` : ''}
                    </span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => dismissAlert(a.id)}>
                    Avslutt
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            tone="brand"
            label="Online akkurat nå"
            value={paired.length ? `${online.length} av ${paired.length}` : '0'}
            sub={
              !paired.length ? 'Ingen TV-er koblet til' : offline.length ? 'Noen trenger tilsyn' : 'Alt ser bra ut'
            }
          />
          {offline.length > 0 ? (
            <SummaryCard
              tone="warn"
              label="Trenger tilsyn"
              value={plural(offline.length, 'TV', 'TV-er')}
              sub={offline.map(displayName).join(', ')}
            />
          ) : (
            <SummaryCard
              tone="plain"
              label="Skjermer"
              value={screens.length}
              sub={pending.length ? plural(pending.length, 'enhet venter', 'enheter venter') : 'Klare til visning'}
            />
          )}
          <SummaryCard
            tone="plain"
            label="Aktive varsler"
            value={activeAlerts.length}
            sub={activeAlerts[0]?.message || 'Ingen varsler vises nå'}
          />
        </section>

        {paired.length === 0 ? (
          <EmptyState onPair={() => go('pairing')} onChannels={() => go('screens')} />
        ) : (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 mr-2 text-lg font-bold text-ink">Etter skjerm</h2>
              {['all', ...channelFilters].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${
                    filter === f ? 'bg-ink text-paper' : 'border border-line bg-card text-muted hover:text-ink'
                  }`}
                >
                  {f === 'all' ? 'Alle' : f}
                </button>
              ))}
              <div className="ml-auto">
                <ViewToggle view={effectiveView} setView={setView} />
              </div>
            </div>

            {effectiveView === 'table' ? (
              <DeviceTable rows={visible} orientationOf={orientationOf} onOpen={openDevice} />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((p) => (
                  <DeviceCard key={p.id} p={p} orientation={orientationOf(p)} onOpen={openDevice} />
                ))}
              </div>
            )}

            {pending.length > 0 && (
              <p className="text-center text-sm text-muted">
                {plural(pending.length, 'enhet venter', 'enheter venter')} på å bli koblet til ·{' '}
                <button
                  type="button"
                  onClick={() => go('pairing')}
                  className="font-semibold text-brand hover:underline"
                >
                  Gå til Enheter
                </button>
              </p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
