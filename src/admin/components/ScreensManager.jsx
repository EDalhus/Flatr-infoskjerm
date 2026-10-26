// Skjermer – de fysiske skjermene: en Apple TV (koblet til med kode) eller en
// nettleser/smart-TV (åpner skjermens lenke). Hver skjerm viser én presentasjon,
// eller følger tidsplanen sin.
//
// Lista oppdateres hvert 5. sek. Velg flere for masseendringer, eller åpne en
// skjerm for live-visning, fjernkontroll og innstillinger.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import ScreenDetail from './ScreenDetail.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import { AddScreenForm, AddedScreen, codeFromUrl } from './AddScreen.jsx';
import { clientSummary, timeAgo } from './pairingHelpers.js';
import { screenState, StatusPill, showing } from './screenStatus.jsx';
import { Icon, Input, Select, Button, PageHeader, ErrorText } from './ui.jsx';

const LAST_KEY = 'flatr.screens.open';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function ScreenCard({ s, selected, selecting, onToggle, onOpen }) {
  const st = screenState(s);
  const model = clientSummary(s.device?.client_info);
  return (
    <article
      className={`group relative flex flex-col gap-3 rounded-2xl border bg-card p-2.5 shadow-card transition-shadow hover:shadow-pop ${
        selected ? 'border-brand ring-2 ring-brand/30' : 'border-hair'
      }`}
    >
      <button type="button" onClick={() => (selecting ? onToggle(s.id) : onOpen(s.id))} className="block text-left" aria-label={`Åpne ${s.name}`}>
        <div className={st === 'offline' ? 'opacity-60 grayscale' : ''}>
          <LiveScreenView screenId={s.id} orientation={s.orientation} />
        </div>
      </button>
      <label
        className={`absolute left-4 top-4 grid h-7 w-7 cursor-pointer place-items-center rounded-lg border bg-card/90 shadow-card transition-opacity ${
          selected || selecting ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
        } ${selected ? 'border-brand' : 'border-line'}`}
      >
        <input type="checkbox" checked={selected} onChange={() => onToggle(s.id)} className="h-4 w-4" aria-label={`Velg ${s.name}`} />
      </label>

      <div className="flex flex-col gap-1.5 px-1.5 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-bold text-ink">{s.name}</span>
          <StatusPill s={s} />
        </div>
        <span className="truncate text-sm text-muted">
          {s.location ? `${s.location} · ` : ''}
          {showing(s)}
          {st === 'offline' && s.device.last_seen ? ` · sist sett ${timeAgo(s.device.last_seen)}` : ''}
        </span>
        {(model || s.tags?.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(s.tags || []).map((t) => (
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

export default function ScreensManager({ onChange, onNavigate }) {
  const [screens, setScreens] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [adding, setAdding] = useState(() => !!codeFromUrl());
  const [added, setAdded] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [filter, setFilter] = useState('all'); // all | online | offline | idle | tag:<navn>
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [detailId, setDetailId] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  const load = () =>
    Promise.all([api.screens.list(), api.playlists.list()])
      .then(([s, p]) => {
        setScreens(s || []);
        setPlaylists(p || []);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api.settings
      .get()
      .then(setAlerts)
      .catch(() => {});
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  // Fra Hjem: åpne skjermen som ble klikket der.
  const loaded = screens !== null;
  useEffect(() => {
    if (!loaded) return;
    try {
      const want = Number(localStorage.getItem(LAST_KEY));
      if (want && screens.some((s) => s.id === want)) setDetailId(want);
      localStorage.removeItem(LAST_KEY);
    } catch {
      /* ignore */
    }
  }, [loaded]);

  const say = (msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 2800);
  };

  const list = screens || [];
  const counts = {
    all: list.length,
    online: list.filter((s) => ['online', 'browser'].includes(screenState(s))).length,
    offline: list.filter((s) => screenState(s) === 'offline').length,
    idle: list.filter((s) => screenState(s) === 'idle').length
  };
  const allTags = useMemo(() => [...new Set(list.flatMap((s) => s.tags || []))].sort((a, b) => a.localeCompare(b, 'nb')), [screens]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = { online: 0, browser: 0, offline: 1, idle: 2 };
    return list
      .filter((s) => {
        const st = screenState(s);
        if (filter === 'online') return st === 'online' || st === 'browser';
        if (filter === 'offline') return st === 'offline';
        if (filter === 'idle') return st === 'idle';
        if (filter.startsWith('tag:')) return (s.tags || []).includes(filter.slice(4));
        return true;
      })
      .filter(
        (s) =>
          !q ||
          [s.name, s.location, s.playlist_name, s.device?.client_info?.model, s.device?.client_info?.device_name, ...(s.tags || [])]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
      )
      .sort((a, b) => rank[screenState(a)] - rank[screenState(b)] || a.name.localeCompare(b.name, 'nb'));
  }, [screens, filter, query]);

  const detail = list.find((s) => s.id === detailId) || null;
  const chosen = list.filter((s) => selected.has(s.id));
  const withTv = chosen.filter((s) => s.device).map((s) => s.id);

  /* ------------------------------- handlinger ------------------------------- */

  const act = async (fn, msg) => {
    try {
      await fn();
      if (msg) say(msg);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const runCommand = async (ids, command, label) => {
    if (!ids.length) return say('Ingen av de valgte skjermene har en Apple TV.');
    await Promise.allSettled(ids.map((screen_id) => api.pairing.command({ screen_id, command })));
    say(`${label} sendt til ${plural(ids.length, 'skjerm', 'skjermer')}.`);
  };

  const patch = (id, body, msg) =>
    act(async () => {
      setScreens((prev) => prev.map((s) => (s.id === id ? { ...s, ...body } : s)));
      await api.screens.update(id, body);
    }, msg);

  const removeScreens = (ids) => {
    if (!ids.length) return;
    const n = plural(ids.length, 'skjerm', 'skjermer');
    if (!confirm(`Slette ${n}? Presentasjonene beholdes. En Apple TV som er koblet til viser en ny kode.`)) return;
    act(async () => {
      await Promise.allSettled(ids.map((id) => api.screens.remove(id)));
      setSelected(new Set());
      if (ids.includes(detailId)) setDetailId(null);
    }, `Slettet ${n}.`);
  };

  const bulkShow = (pid) =>
    pid &&
    act(async () => {
      await Promise.allSettled(chosen.map((s) => api.screens.update(s.id, { playlist_id: Number(pid) })));
    }, `${plural(chosen.length, 'skjerm', 'skjermer')} oppdatert.`);

  const addTag = () => {
    const tag = window.prompt('Tagg å legge til (f.eks. «2. etasje»):')?.trim();
    if (!tag) return;
    act(async () => {
      await Promise.allSettled(chosen.map((s) => api.screens.update(s.id, { tags: [...new Set([...(s.tags || []), tag])] })));
    }, `Tagget med «${tag}».`);
  };

  const saveAlerts = async (p) => {
    setAlerts((a) => ({ ...a, ...p }));
    try {
      setAlerts(await api.settings.update(p));
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

  const showAdd = adding || added || (loaded && !list.length);
  const closeAdd = list.length ? () => (setAdding(false), setAdded(null)) : null;

  return (
    <>
      <PageHeader
        title="Skjermer"
        subtitle="TV-ene og skjermene som viser innholdet ditt."
        action={
          !showAdd && (
            <Button onClick={() => setAdding(true)}>
              <Icon name="plus" className="h-4 w-4" />
              Legg til skjerm
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

        {showAdd && (
          <section className="rounded-3xl border border-line bg-card p-6 shadow-card sm:p-8">
            {added ? (
              <AddedScreen
                result={added}
                onAnother={() => (setAdded(null), setFormKey((k) => k + 1))}
                onClose={() => (setAdded(null), setAdding(false))}
              />
            ) : (
              <>
                <h2 className="m-0 mb-1 text-xl font-bold text-ink">Legg til en skjerm</h2>
                <p className="m-0 mb-5 text-sm text-muted">Koble til en Apple TV med koden den viser, eller lag en lenke for en nettleser.</p>
                <AddScreenForm
                  key={formKey}
                  playlists={playlists}
                  initialCode={codeFromUrl()}
                  onDone={(r) => {
                    setAdded(r);
                    load();
                    onChange?.();
                  }}
                  onCancel={closeAdd}
                />
              </>
            )}
          </section>
        )}

        {list.length > 0 && (
          <>
            <section className="grid gap-4 sm:grid-cols-3">
              {[
                ['online', 'Online', counts.online, 'bg-ok-tint text-ok'],
                ['offline', 'Frakoblet', counts.offline, counts.offline ? 'bg-warn-tint text-warn' : 'bg-card text-ink'],
                ['idle', 'Ikke i bruk', counts.idle, 'bg-card text-ink']
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
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søk navn, sted, innhold …" />
              </label>
            </div>

            {filtered.length === 0 ? (
              <p className="m-0 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-muted">Ingen skjermer her.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((s) => (
                  <ScreenCard key={s.id} s={s} selected={selected.has(s.id)} selecting={selected.size > 0} onToggle={toggle} onOpen={setDetailId} />
                ))}
              </div>
            )}
          </>
        )}

        {alerts && list.some((s) => s.device) && (
          <section className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-card px-5 py-4 text-sm">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zone text-muted">
              <Icon name="megaphone" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink">Varsling når en skjerm faller ut</div>
              <div className="text-muted">Eierne av kontoen får e-post når en Apple TV har vært borte en stund, og når den er tilbake.</div>
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
            aria-label={`Detaljer for ${detail.name}`}
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-md overflow-hidden border-l border-line bg-card shadow-pop"
            style={{ animation: 'drawerIn 0.2s ease-out' }}
          >
            <ScreenDetail
              key={detail.id}
              screen={detail}
              playlists={playlists}
              onClose={() => setDetailId(null)}
              onCommand={(cmd, label) => runCommand([detail.id], cmd, label)}
              onPatch={(body, msg) => patch(detail.id, body, msg)}
              onEditContent={(pid) => onNavigate?.('playlists', { edit: pid })}
              onTimetable={() => onNavigate?.('timetable', { screen: detail.id })}
              onReplaceTv={(code) => act(() => api.pairing.link(code, detail.id), 'Ny TV koblet til.')}
              onUnpairTv={() =>
                confirm('Koble fra Apple TV-en? Den viser en ny kode. Skjermen og innstillingene beholdes.') &&
                act(() => api.pairing.unpair({ screen_id: detail.id }), 'TV-en er koblet fra.')
              }
              onDelete={() => removeScreens([detail.id])}
            />
          </div>
        </div>
      )}

      {/* masseendringer */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-1 rounded-full border border-line bg-ink px-2 py-2 text-paper shadow-pop">
          <span className="px-2 text-sm font-semibold">{selected.size} valgt</span>
          <span className="mx-1 h-5 w-px bg-paper/20" />
          <BulkBtn onClick={() => runCommand(withTv, 'identify', 'Identifiser')}>Identifiser</BulkBtn>
          <BulkBtn onClick={() => runCommand(withTv, 'reload', 'Last inn')}>Last inn</BulkBtn>
          <BulkBtn onClick={addTag}>+ Tagg</BulkBtn>
          <select
            value=""
            onChange={(e) => bulkShow(e.target.value)}
            className="rounded-full bg-paper/10 px-3 py-1.5 text-xs font-semibold text-paper focus:outline-none"
            aria-label="Vis presentasjon"
          >
            <option value="" className="text-ink">
              Vis presentasjon …
            </option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id} className="text-ink">
                {p.name}
              </option>
            ))}
          </select>
          <BulkBtn danger onClick={() => removeScreens([...selected])}>
            Slett
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
