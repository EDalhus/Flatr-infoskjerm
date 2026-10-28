// Hjem – «Skjermene dine»: status for alle skjermer, hva de viser, og
// snarveier for å sende et varsel eller legge til en skjerm. Er ingen skjerm
// i gang ennå, vises oppstartsveiviseren i stedet.
// Visningen er kort (standard i Varm) eller tabell (standard i Presis).

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Button, Input, Select, PageHeader, ErrorText } from './ui.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import Onboarding from './Onboarding.jsx';
import { screenState, StatusPill, showing } from './screenStatus.jsx';
import { timeAgo } from './pairingHelpers.js';

const OPEN_SCREEN_KEY = 'flatr.screens.open';
const WIZARD_SKIP_KEY = 'flatr.onboarding.skipped';
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

function Preview({ s }) {
  return <LiveScreenView screenId={s.id} orientation={s.orientation} />;
}

function ScreenCard({ s, onOpen }) {
  const st = screenState(s);
  return (
    <button
      type="button"
      onClick={() => onOpen(s.id)}
      className="group flex flex-col gap-3 rounded-2xl border border-hair bg-card p-2.5 text-left shadow-card transition-shadow hover:shadow-pop"
    >
      <div className={st === 'offline' ? 'opacity-60 grayscale' : ''}>
        <Preview s={s} />
      </div>
      <div className="flex flex-col gap-1 px-1.5 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-bold text-ink">{s.name}</span>
          <StatusPill s={s} />
        </div>
        <span className="truncate text-sm text-muted">
          {showing(s)}
          {st === 'offline' && s.device.last_seen && ` · sist sett ${timeAgo(s.device.last_seen)}`}
        </span>
      </div>
    </button>
  );
}

function ScreenTable({ rows, onOpen }) {
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
          {rows.map((s) => {
            const st = screenState(s);
            const seen = s.device?.last_seen || s.last_seen;
            return (
              <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer border-t border-hair bg-card transition-colors hover:bg-zone">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-16 shrink-0 ${st === 'offline' ? 'opacity-60 grayscale' : ''}`}>
                      <Preview s={s} />
                    </div>
                    <span className="truncate font-medium text-ink">{s.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill s={s} />
                </td>
                <td className="px-4 py-2.5 text-ink/80">{showing(s)}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">{s.device ? s.device.client_info?.model || 'Apple TV' : 'Nettleser'}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-muted">
                  {st === 'online' || st === 'browser' ? 'nå' : seen ? timeAgo(seen) : '–'}
                </td>
              </tr>
            );
          })}
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

export default function Dashboard({ onChange, onNavigate, me, theme }) {
  const [screens, setScreens] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [wizard, setWizard] = useState(null); // null = avgjøres når data er lastet
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
    Promise.all([api.screens.list(), api.playlists.list(), api.alerts.list(false)])
      .then(([s, p, a]) => {
        setScreens(s || []);
        setPlaylists(p || []);
        setActiveAlerts(a || []);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const go = (id, params) => (onNavigate ? onNavigate(id, params) : (window.location.href = `/admin?view=${id}`));

  const all = screens || [];
  const rank = { online: 0, browser: 0, offline: 1, idle: 2 };
  const sorted = useMemo(
    () => [...all].sort((a, b) => rank[screenState(a)] - rank[screenState(b)] || a.name.localeCompare(b.name, 'nb')),
    [screens]
  );
  const live = all.filter((s) => ['online', 'browser'].includes(screenState(s)));
  const offline = all.filter((s) => screenState(s) === 'offline');
  const inUse = all.filter((s) => screenState(s) !== 'idle');

  // Veiviseren vises til minst én skjerm er koblet til og viser noe.
  const running = all.some((s) => (s.device || s.online) && s.playlist_id && s.slide_count > 0);
  useEffect(() => {
    if (!screens || wizard !== null) return;
    let skipped = false;
    try {
      skipped = localStorage.getItem(WIZARD_SKIP_KEY) === '1';
    } catch {
      /* ignore */
    }
    setWizard(!running && !skipped);
  }, [screens]);

  const tagFilters = useMemo(() => [...new Set(all.flatMap((s) => s.tags || []))].sort((a, b) => a.localeCompare(b, 'nb')), [screens]);
  const visible = filter === 'all' ? sorted : sorted.filter((s) => (s.tags || []).includes(filter));

  const openScreen = (id) => {
    try {
      localStorage.setItem(OPEN_SCREEN_KEY, String(id));
    } catch {
      /* ignore */
    }
    go('screens');
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
      const body = { message: message.trim() };
      if (target.startsWith('tag:')) body.target_tag = target.slice(4);
      else if (target) body.target_screen_id = Number(target);
      await api.alerts.create(body);
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

  if (screens && wizard) {
    return (
      <Onboarding
        greeting={greeting(me?.name)}
        playlists={playlists}
        onNavigate={go}
        onDone={() => {
          try {
            localStorage.setItem(WIZARD_SKIP_KEY, '1');
          } catch {
            /* ignore */
          }
          setWizard(false);
          load();
          onChange?.();
        }}
      />
    );
  }

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
            <Button onClick={() => go('screens')}>
              <Icon name="plus" className="h-4 w-4" />
              Legg til skjerm
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
                {[...new Set(all.flatMap((s) => s.tags || []))].sort().map((t) => (
                  <option key={`tag:${t}`} value={`tag:${t}`}>
                    Gruppe: {t}
                  </option>
                ))}
                {all.map((s) => (
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
                      {a.target_tag ? `Gruppe: ${a.target_tag}` : a.target_screen_id ? all.find((s) => s.id === a.target_screen_id)?.name || 'Én skjerm' : 'Alle skjermer'}
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
            value={inUse.length ? `${live.length} av ${inUse.length}` : '0'}
            sub={!inUse.length ? 'Ingen skjermer i bruk' : offline.length ? 'Noen trenger tilsyn' : 'Alt ser bra ut'}
          />
          {offline.length > 0 ? (
            <SummaryCard tone="warn" label="Trenger tilsyn" value={plural(offline.length, 'skjerm', 'skjermer')} sub={offline.map((s) => s.name).join(', ')} />
          ) : (
            <SummaryCard tone="plain" label="Presentasjoner" value={playlists.length} sub={playlists.map((p) => p.name).slice(0, 3).join(', ') || 'Ingen ennå'} />
          )}
          <SummaryCard tone="plain" label="Aktive varsler" value={activeAlerts.length} sub={activeAlerts[0]?.message || 'Ingen varsler vises nå'} />
        </section>

        {all.length > 0 && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 mr-2 text-lg font-bold text-ink">Skjermene dine</h2>
              {tagFilters.length > 0 &&
                ['all', ...tagFilters].map((f) => (
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
              <ScreenTable rows={visible} onOpen={openScreen} />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((s) => (
                  <ScreenCard key={s.id} s={s} onOpen={openScreen} />
                ))}
              </div>
            )}
          </section>
        )}

        {!running && (
          <p className="text-center text-sm text-muted">
            Ingen skjerm viser noe ennå ·{' '}
            <button type="button" onClick={() => setWizard(true)} className="font-semibold text-brand hover:underline">
              Start veiviseren
            </button>
          </p>
        )}
      </div>
    </>
  );
}
