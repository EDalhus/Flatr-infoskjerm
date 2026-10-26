// Enheter – TV-ene (Apple TV og andre spillere) som viser skjermene.
//
//   1. Apple TV-en viser en kode (+ QR) ved oppstart.
//   2. Tast/skann koden her, velg skjerm, «Koble til» -> POST /api/pairing/link.
//   3. TV-en oppdager parringen ved neste status-poll og begynner å spille.
//
// Lista oppdateres hvert 5. sek. Velg flere for masseendringer, eller åpne en
// enhet for detaljer, skjermbilde, telemetri og innstillinger.

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import DeviceDetail from './DeviceDetail.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import { codeDisplay, displayName, clientSummary, timeAgo, timeUntil } from './pairingHelpers.js';
import { Icon, Input, Select, Button, PageHeader, ErrorText } from './ui.jsx';

const LAST_KEY = 'flatr.pairing.lastDevice';
const normalize = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const codeFromUrl = () => (typeof window === 'undefined' ? '' : normalize(new URLSearchParams(window.location.search).get('code') || ''));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ----------------------------- koble til en TV ----------------------------- */

function CodeInput({ value, onChange, inputRef }) {
  const chars = value.padEnd(6, ' ').split('');
  return (
    <label className="relative block cursor-text">
      <span className="sr-only">Koden som vises på TV-en</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(normalize(e.target.value))}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
        aria-label="Kode fra TV-en"
      />
      <span className="pointer-events-none flex items-center gap-1.5" aria-hidden="true">
        {chars.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i === 3 && <span className="mx-1 text-2xl font-bold text-muted">–</span>}
            <span
              className={`grid h-14 w-11 place-items-center rounded-xl border-2 bg-paper font-mono text-2xl font-bold text-ink sm:h-16 sm:w-12 ${
                i === value.length ? 'border-brand' : c.trim() ? 'border-line' : 'border-hair'
              }`}
            >
              {c.trim()}
            </span>
          </span>
        ))}
      </span>
    </label>
  );
}

function PairPanel({ screens, onPaired, onClose, initialCode }) {
  const [code, setCode] = useState(initialCode);
  const [screenId, setScreenId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!screenId && screens.length === 1) setScreenId(String(screens[0].id));
  }, [screens, screenId]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (code.length < 6) return setError('Koden har 6 tegn – den står på TV-en.');
    if (!screenId) return setError('Velg hvilken skjerm TV-en skal vise.');
    setBusy(true);
    try {
      const res = await api.pairing.link(code, Number(screenId));
      setDone(res);
      setCode('');
      onPaired?.(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-3xl border border-line bg-card px-6 py-10 text-center shadow-card">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-ok-tint text-ok">
          <Icon name="check" className="h-7 w-7" />
        </span>
        <h2 className="m-0 text-xl font-bold text-ink">TV-en er koblet til</h2>
        <p className="m-0 max-w-md text-sm text-muted">
          Den viser «{done.screen_name}» om noen sekunder. Gi den gjerne et navn og tagger når den dukker opp i lista.
        </p>
        <div className="mt-2 flex gap-2">
          <Button onClick={() => setDone(null)}>Koble til en til</Button>
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              Ferdig
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-card shadow-card">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_300px]">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <div>
            <h2 className="m-0 text-xl font-bold text-ink">Koble til en TV</h2>
            <p className="m-0 mt-1 text-sm text-muted">Tast inn koden som står på TV-en, og velg hva den skal vise.</p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted">Kode fra TV-en</span>
            <CodeInput value={code} onChange={setCode} inputRef={inputRef} />
          </div>

          <label className="flex max-w-sm flex-col gap-2">
            <span className="text-xs font-semibold text-muted">Skal vise skjermen</span>
            {screens.length ? (
              <Select value={screenId} onChange={(e) => setScreenId(e.target.value)}>
                <option value="">Velg skjerm …</option>
                {screens.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.location ? ` – ${s.location}` : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-sm text-muted">
                Du har ingen skjermer ennå.{' '}
                <a href="/admin?view=screens" className="font-semibold text-brand hover:underline">
                  Lag en skjerm først
                </a>
                .
              </span>
            )}
          </label>

          <ErrorText>{error}</ErrorText>

          <div className="flex gap-2">
            <Button type="submit" disabled={busy || code.length < 6 || !screenId}>
              {busy ? 'Kobler til …' : 'Koble til'}
            </Button>
            {onClose && (
              <Button type="button" variant="outline" onClick={onClose}>
                Avbryt
              </Button>
            )}
          </div>
        </form>

        <ol className="m-0 flex list-none flex-col gap-4 rounded-2xl bg-zone p-5 text-sm">
          {[
            ['Åpne Flatr-appen', 'på Apple TV-en. Første gang viser den en kode og en QR-kode.'],
            ['Tast inn koden', 'her – eller skann QR-koden med mobilen, så fylles den ut av seg selv.'],
            ['Velg skjerm', 'og trykk «Koble til». TV-en bytter innhold med en gang.']
          ].map(([title, text], i) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-onbrand">{i + 1}</span>
              <span className="text-muted">
                <span className="font-semibold text-ink">{title}</span> {text}
              </span>
            </li>
          ))}
          <li className="border-t border-line pt-4 text-xs text-muted">
            Smart-TV eller PC? Åpne skjermens lenke i nettleseren i stedet – finn den under{' '}
            <a href="/admin?view=screens" className="font-semibold text-brand hover:underline">
              Skjermer
            </a>
            .
          </li>
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------- kort ---------------------------------- */

function StatusPill({ p }) {
  if (p.status === 'pending')
    return <span className="shrink-0 rounded-full bg-badge px-2.5 py-0.5 text-xs font-bold text-badge-ink">Venter · {timeUntil(p.expires_at)}</span>;
  if (p.status === 'expired') return <span className="shrink-0 rounded-full bg-danger-tint px-2.5 py-0.5 text-xs font-bold text-danger">Utløpt</span>;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
        p.online ? 'bg-ok-tint text-ok' : 'bg-warn-tint text-warn'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${p.online ? 'bg-ok' : 'bg-warn'}`} aria-hidden="true" />
      {p.online ? 'Online' : 'Frakoblet'}
    </span>
  );
}

function DeviceCard({ p, screens, selected, selecting, onToggle, onOpen }) {
  const screen = screens.find((s) => s.id === p.screen_id);
  const orientation = screen?.orientation === 'portrait' ? 'portrait' : 'landscape';
  // «arm64 · tvOS 26.2 · app 1.0 (1) · 3840×2160»
  const model = clientSummary(p.client_info);
  return (
    <article
      className={`group relative flex flex-col gap-3 rounded-2xl border bg-card p-2.5 shadow-card transition-shadow hover:shadow-pop ${
        selected ? 'border-brand ring-2 ring-brand/30' : 'border-hair'
      }`}
    >
      <button
        type="button"
        onClick={() => (selecting ? onToggle(p.device_id) : onOpen(p.device_id))}
        className="block text-left"
        aria-label={`Åpne ${displayName(p)}`}
      >
        <div className={`relative aspect-video overflow-hidden rounded-xl bg-zone ${p.status === 'paired' && !p.online ? 'opacity-60 grayscale' : ''}`}>
          {p.screen_id && <LiveScreenView screenId={p.screen_id} orientation={orientation} />}
        </div>
      </button>
      <label
        className={`absolute left-4 top-4 grid h-7 w-7 cursor-pointer place-items-center rounded-lg border bg-card/90 shadow-card transition-opacity ${
          selected || selecting ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
        } ${selected ? 'border-brand' : 'border-line'}`}
      >
        <input type="checkbox" checked={selected} onChange={() => onToggle(p.device_id)} className="h-4 w-4" aria-label={`Velg ${displayName(p)}`} />
      </label>

      <div className="flex flex-col gap-1.5 px-1.5 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-bold text-ink">{displayName(p)}</span>
          <StatusPill p={p} />
        </div>
        <span className="truncate text-sm text-muted">
          {p.status === 'pending' ? `Kode ${codeDisplay(p.code)}` : p.screen_name ? `Viser «${p.screen_name}»` : 'Ingen skjerm'}
          {p.status === 'paired' && !p.online && p.last_seen ? ` · sist sett ${timeAgo(p.last_seen)}` : ''}
        </span>
        {(model || p.tags?.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(p.tags || []).map((t) => (
              <span key={t} className="rounded-full bg-zone px-2 py-0.5 text-[11px] font-medium text-ink/80">
                {t}
              </span>
            ))}
            {model && <span className="text-[11px] text-muted">{model}</span>}
          </div>
        )}
      </div>
    </article>
  );
}

function BulkBtn({ children, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${danger ? 'text-danger hover:bg-danger/20' : 'hover:bg-paper/10'}`}
    >
      {children}
    </button>
  );
}

/* ----------------------------------- side ---------------------------------- */

export default function PairingManager({ onChange }) {
  const [screens, setScreens] = useState([]);
  const [pairings, setPairings] = useState(null);
  const [pairOpen, setPairOpen] = useState(() => !!codeFromUrl());
  const [filter, setFilter] = useState('all'); // all | online | offline | pending | tag:<navn>
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [detailId, setDetailId] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  const loadPairings = () =>
    api.pairing
      .list()
      .then((rows) => setPairings(rows || []))
      .catch(() => {});

  useEffect(() => {
    api.screens
      .list()
      .then((rows) => setScreens(rows || []))
      .catch((e) => setError(e.message));
    api.settings
      .get()
      .then(setAlerts)
      .catch(() => {});
    loadPairings();
    const t = setInterval(loadPairings, 5000);
    return () => clearInterval(t);
  }, []);

  // Fra Hjem: åpne enheten som ble klikket der.
  const loaded = pairings !== null;
  useEffect(() => {
    if (!loaded) return;
    try {
      const want = localStorage.getItem(LAST_KEY);
      if (want && pairings.some((p) => p.device_id === want)) setDetailId(want);
      localStorage.removeItem(LAST_KEY);
    } catch {
      /* ignore */
    }
  }, [loaded]);

  const say = (msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 2800);
  };

  const list = pairings || [];
  const counts = {
    all: list.length,
    online: list.filter((p) => p.status === 'paired' && p.online).length,
    offline: list.filter((p) => p.status === 'paired' && !p.online).length,
    pending: list.filter((p) => p.status === 'pending').length
  };
  const allTags = useMemo(() => [...new Set(list.flatMap((p) => p.tags || []))].sort((a, b) => a.localeCompare(b, 'nb')), [pairings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((p) => {
        if (filter === 'online') return p.status === 'paired' && p.online;
        if (filter === 'offline') return p.status === 'paired' && !p.online;
        if (filter === 'pending') return p.status === 'pending';
        if (filter.startsWith('tag:')) return (p.tags || []).includes(filter.slice(4));
        return true;
      })
      .filter(
        (p) =>
          !q ||
          [displayName(p), p.code, codeDisplay(p.code), p.screen_name, p.client_info?.model, ...(p.tags || [])]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
      )
      .sort(
        (a, b) =>
          (a.status === 'pending') - (b.status === 'pending') ||
          Number(b.online) - Number(a.online) ||
          displayName(a).localeCompare(displayName(b), 'nb')
      );
  }, [pairings, filter, query]);

  const detail = list.find((p) => p.device_id === detailId) || null;
  const selectedPaired = list.filter((p) => selected.has(p.device_id) && p.status === 'paired').map((p) => p.device_id);

  /* ------------------------------- handlinger ------------------------------- */

  const runCommand = async (ids, command, label) => {
    if (!ids.length) return say('Ingen tilkoblede enheter valgt.');
    await Promise.allSettled(ids.map((device_id) => api.pairing.command({ device_id, command })));
    say(`${label} sendt til ${plural(ids.length, 'enhet', 'enheter')}.`);
  };

  const act = async (fn, msg) => {
    try {
      await fn();
      if (msg) say(msg);
      await loadPairings();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const unpair = (ids) => {
    if (!ids.length || !confirm(`Koble fra ${plural(ids.length, 'enhet', 'enheter')}? De viser en ny kode og må kobles til på nytt.`)) return;
    act(async () => {
      await Promise.allSettled(ids.map((device_id) => api.pairing.unpair({ device_id })));
      setSelected(new Set());
      if (ids.includes(detailId)) setDetailId(null);
    }, 'Koblet fra.');
  };

  const bulkReassign = (sid) =>
    sid &&
    act(async () => {
      await Promise.allSettled(selectedPaired.map((id) => api.pairing.reassign(id, Number(sid))));
    }, `Flyttet ${plural(selectedPaired.length, 'enhet', 'enheter')}.`);

  const addTag = () => {
    const tag = window.prompt('Tagg å legge til (f.eks. «2. etasje»):');
    if (tag?.trim()) act(() => api.pairing.tags([...selected], [tag.trim()], 'add'), `Tagget med «${tag.trim()}».`);
  };

  const saveAlerts = async (patch) => {
    setAlerts((a) => ({ ...a, ...patch }));
    try {
      setAlerts(await api.settings.update(patch));
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const chip = (id, label, count) => (
    <button
      key={id}
      type="button"
      onClick={() => setFilter(id)}
      aria-pressed={filter === id}
      className={`flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
        filter === id ? 'bg-ink text-paper' : 'border border-line bg-card text-muted hover:text-ink'
      }`}
    >
      {label}
      {count != null && <span className="tabular-nums opacity-70">{count}</span>}
    </button>
  );

  const showPair = pairOpen || (loaded && !list.length);

  return (
    <>
      <PageHeader
        title="Enheter"
        subtitle="Apple TV-ene og andre spillere som viser skjermene dine."
        action={
          !showPair && (
            <Button onClick={() => setPairOpen(true)}>
              <Icon name="plus" className="h-4 w-4" />
              Koble til TV
            </Button>
          )
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 pb-28 pt-4 sm:px-8">
        <ErrorText>{error}</ErrorText>
        {flash && (
          <p role="status" className="m-0 rounded-xl bg-ok-tint px-4 py-2.5 text-sm font-semibold text-ok">
            {flash}
          </p>
        )}

        {showPair && (
          <PairPanel
            screens={screens}
            initialCode={codeFromUrl()}
            onPaired={() => loadPairings().then(() => onChange?.())}
            onClose={list.length ? () => setPairOpen(false) : null}
          />
        )}

        {list.length > 0 && (
          <>
            <section className="grid gap-4 sm:grid-cols-3">
              {[
                ['online', 'Online', counts.online, 'bg-ok-tint text-ok'],
                ['offline', 'Frakoblet', counts.offline, counts.offline ? 'bg-warn-tint text-warn' : 'bg-card text-ink'],
                ['pending', 'Venter på kobling', counts.pending, 'bg-card text-ink']
              ].map(([id, label, n, tone]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(filter === id ? 'all' : id)}
                  aria-pressed={filter === id}
                  className={`flex flex-col gap-1 rounded-2xl border p-5 text-left transition-shadow hover:shadow-card ${tone} ${
                    filter === id ? 'border-ink' : 'border-line'
                  }`}
                >
                  <span className="text-sm font-semibold opacity-90">{label}</span>
                  <span className="text-[2rem] font-extrabold leading-tight tabular-nums">{n}</span>
                </button>
              ))}
            </section>

            <div className="flex flex-wrap items-center gap-2">
              {chip('all', 'Alle', counts.all)}
              {allTags.map((t) => chip(`tag:${t}`, t))}
              <label className="ml-auto flex w-64 max-w-full items-center gap-2">
                <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
                <span className="sr-only">Søk</span>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søk navn, kode, skjerm …" />
              </label>
            </div>

            {filtered.length === 0 ? (
              <p className="m-0 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-muted">Ingen enheter her.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((p) => (
                  <DeviceCard
                    key={p.id}
                    p={p}
                    screens={screens}
                    selected={selected.has(p.device_id)}
                    selecting={selected.size > 0}
                    onToggle={toggle}
                    onOpen={setDetailId}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {alerts && list.length > 0 && (
          <section className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-card px-5 py-4 text-sm">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zone text-muted">
              <Icon name="megaphone" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink">Varsling når en TV faller ut</div>
              <div className="text-muted">Eierne av kontoen får e-post når en TV har vært borte en stund, og når den er tilbake.</div>
            </div>
            <label className="flex items-center gap-2 text-muted">
              <input type="checkbox" checked={alerts.offline_alerts} onChange={(e) => saveAlerts({ offline_alerts: e.target.checked })} />
              På, etter
              <Select
                value={alerts.offline_minutes}
                disabled={!alerts.offline_alerts}
                onChange={(e) => saveAlerts({ offline_minutes: Number(e.target.value) })}
                className="!h-8 !w-24"
              >
                {[...new Set([2, 5, 10, 15, 30, 60, alerts.offline_minutes])]
                  .sort((a, b) => a - b)
                  .map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
              </Select>
            </label>
          </section>
        )}
      </div>

      {/* detaljer som skuff fra høyre */}
      {detail && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setDetailId(null)}>
          <div
            role="dialog"
            aria-label={`Detaljer for ${displayName(detail)}`}
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-md overflow-hidden border-l border-line bg-card shadow-pop"
            style={{ animation: 'drawerIn 0.2s ease-out' }}
          >
            <DeviceDetail
              key={detail.device_id}
              pairing={detail}
              screens={screens}
              onClose={() => setDetailId(null)}
              onCommand={(cmd, label) => runCommand([detail.device_id], cmd, label)}
              onSetLabel={(label) => act(() => api.pairing.rename(detail.device_id, label), label ? 'Navn lagret.' : 'Navn fjernet.')}
              onReassign={(sid) => act(() => api.pairing.reassign(detail.device_id, Number(sid)), 'Skjerm byttet.')}
              onUnpair={() => unpair([detail.device_id])}
              onSetTags={(tags) => act(() => api.pairing.tags([detail.device_id], tags, 'set'))}
            />
          </div>
        </div>
      )}

      {/* masseendringer */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-1 rounded-full border border-line bg-ink px-2 py-2 text-paper shadow-pop">
          <span className="px-2 text-sm font-semibold">{selected.size} valgt</span>
          <span className="mx-1 h-5 w-px bg-paper/20" />
          <BulkBtn onClick={() => runCommand(selectedPaired, 'identify', 'Identifiser')}>Identifiser</BulkBtn>
          <BulkBtn onClick={() => runCommand(selectedPaired, 'reload', 'Last inn')}>Last inn</BulkBtn>
          <BulkBtn onClick={addTag}>+ Tagg</BulkBtn>
          <select
            value=""
            onChange={(e) => bulkReassign(e.target.value)}
            className="rounded-full bg-paper/10 px-3 py-1.5 text-xs font-semibold text-paper focus:outline-none"
            aria-label="Bytt skjerm"
          >
            <option value="" className="text-ink">
              Bytt skjerm …
            </option>
            {screens.map((s) => (
              <option key={s.id} value={s.id} className="text-ink">
                {s.name}
              </option>
            ))}
          </select>
          <BulkBtn danger onClick={() => unpair([...selected])}>
            Koble fra
          </BulkBtn>
          <span className="mx-1 h-5 w-px bg-paper/20" />
          <button type="button" onClick={() => setSelected(new Set())} className="grid h-7 w-7 place-items-center rounded-full hover:bg-paper/10" aria-label="Fjern utvalg">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
