// Enhets-panel for TV-klienter – parring, oversikt og fjernkontroll.
//
// Slik henger det sammen:
//   1. Apple TV-en viser en kode (+ QR) ved oppstart.
//   2. Tast/skann koden her, velg skjerm, «Koble til» → POST /api/pairing/link.
//   3. TV-en oppdager parringen ved neste status-poll og begynner å spille.
//
// Lista pollers hvert 5. sek. Velg flere for bulk-handlinger, eller åpne en
// enhet for detaljer, telemetri og innstillinger.

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import DeckPreviewStrip from './DeckPreviewStrip.jsx';
import DeviceDetail from './DeviceDetail.jsx';
import {
  codeDisplay,
  displayName,
  deviceStatus,
  clientSummary,
  timeAgo,
  timeUntil
} from './pairingHelpers.js';
import { Icon, Field, Input, Select, Button, Card, PageHeader, ErrorText } from './ui.jsx';

const normalize = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const pretty = (s) => {
  const n = normalize(s);
  return n.length > 3 ? `${n.slice(0, 3)}-${n.slice(3)}` : n;
};

const codeFromUrl = () => {
  if (typeof window === 'undefined') return '';
  return normalize(new URLSearchParams(window.location.search).get('code') || '');
};

function BulkBtn({ children, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        danger ? 'text-red-300 hover:bg-red-500/20' : 'text-white hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

export default function PairingManager({ onChange }) {
  const [screens, setScreens] = useState([]);
  const [pairings, setPairings] = useState([]);
  const [code, setCode] = useState(codeFromUrl);
  const [screenId, setScreenId] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [detailId, setDetailId] = useState(null);
  const codeRef = useRef(null);

  useEffect(() => {
    api.screens
      .list()
      .then((rows) => setScreens(rows || []))
      .catch((e) => setError(e.message));
    if (codeFromUrl()) codeRef.current?.focus();
  }, []);

  const loadPairings = () =>
    api.pairing
      .list()
      .then((rows) => setPairings(rows || []))
      .catch(() => {});

  useEffect(() => {
    loadPairings();
    const t = setInterval(loadPairings, 5000);
    return () => clearInterval(t);
  }, []);

  const say = (msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 2600);
  };

  const pendingCount = useMemo(
    () => pairings.filter((p) => p.status === 'pending').length,
    [pairings]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pairings;
    return pairings.filter((p) =>
      [
        displayName(p),
        p.code,
        codeDisplay(p.code),
        p.screen_name,
        p.client_info?.model,
        p.client_info?.ip
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [pairings, query]);

  const detailPairing = pairings.find((p) => p.device_id === detailId) || null;
  const selectedList = pairings.filter((p) => selected.has(p.device_id));
  const selectedPairedIds = selectedList.filter((p) => p.status === 'paired').map((p) => p.device_id);

  // ---- handlinger ----
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setOk('');
    const clean = normalize(code);
    if (clean.length < 4) return setError('Skriv inn koden som vises på TV-en.');
    if (!screenId) return setError('Velg hvilken skjerm enheten skal vise.');
    setBusy(true);
    try {
      const res = await api.pairing.link(clean, Number(screenId));
      setOk(
        res?.already
          ? `Allerede paret med «${res.screen_name}».`
          : `Paret med «${res.screen_name}». TV-en bytter innhold om noen sekunder.`
      );
      setCode('');
      await loadPairings();
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const runCommand = async (ids, command, label) => {
    if (!ids.length) return say('Ingen parede enheter valgt.');
    try {
      await Promise.allSettled(ids.map((device_id) => api.pairing.command({ device_id, command })));
      say(`${label} sendt til ${ids.length} ${ids.length === 1 ? 'enhet' : 'enheter'}.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const setLabel = async (deviceId, label) => {
    try {
      await api.pairing.rename(deviceId, label);
      say(label ? 'Navn lagret.' : 'Navn fjernet.');
      await loadPairings();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const reassignDevice = async (deviceId, newScreenId, silent) => {
    if (!newScreenId) return;
    try {
      const res = await api.pairing.reassign(deviceId, Number(newScreenId));
      if (!silent) say(`Flyttet til «${res.screen_name}».`);
      await loadPairings();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const bulkReassign = async (ids, newScreenId) => {
    if (!newScreenId || !ids.length) return;
    await Promise.allSettled(ids.map((id) => api.pairing.reassign(id, Number(newScreenId))));
    const name = screens.find((s) => s.id === Number(newScreenId))?.name;
    say(`Flyttet ${ids.length} ${ids.length === 1 ? 'enhet' : 'enheter'}${name ? ` til «${name}»` : ''}.`);
    await loadPairings();
    onChange?.();
  };

  const unpairDevices = async (ids) => {
    if (!ids.length) return;
    if (!confirm(`Opphev ${ids.length} ${ids.length === 1 ? 'paring' : 'paringer'}?`)) return;
    try {
      await Promise.allSettled(ids.map((device_id) => api.pairing.unpair({ device_id })));
      setSelected(new Set());
      if (ids.includes(detailId)) setDetailId(null);
      await loadPairings();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- utvalg ----
  const toggle = (deviceId) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(deviceId) ? next.delete(deviceId) : next.add(deviceId);
      return next;
    });
  const allShownSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.device_id));
  const toggleAll = () =>
    setSelected(allShownSelected ? new Set() : new Set(filtered.map((p) => p.device_id)));

  return (
    <>
      <PageHeader
        crumbs={['Visning', 'Parring']}
        action={
          pendingCount > 0 ? (
            <span className="rounded-full bg-badge px-2.5 py-1 text-xs font-bold text-badge-ink">
              {pendingCount} venter
            </span>
          ) : null
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-6 pb-24 sm:p-8">
        <Card title="Koble til en ny enhet">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Parringskode" hint="Vises på TV-en ved oppstart (eller skann QR-en).">
              <Input
                ref={codeRef}
                value={pretty(code)}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABC-DEF"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-lg tracking-[0.3em]"
              />
            </Field>
            <Field label="Skjerm" hint="Hva enheten skal vise etter parring.">
              <Select value={screenId} onChange={(e) => setScreenId(e.target.value)}>
                <option value="">Velg skjerm …</option>
                {screens.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.location ? ` – ${s.location}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Kobler til …' : 'Koble til'}
              </Button>
              {ok && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-ok">
                  <Icon name="check" className="h-4 w-4" />
                  {ok}
                </span>
              )}
            </div>
            <div className="sm:col-span-2">
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        </Card>

        {flash && (
          <p className="rounded-lg border border-ok/30 bg-ok-tint px-3 py-2 text-sm font-medium text-ok">
            {flash}
          </p>
        )}

        <section className="overflow-hidden rounded-xl border border-hair bg-card shadow-card">
          <header className="flex items-center gap-3 border-b border-hair bg-zone px-4 py-2.5">
            <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zoneink">
              <input
                type="checkbox"
                checked={allShownSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-line accent-brand"
                disabled={filtered.length === 0}
              />
              Enheter · {pairings.length}
            </label>
            <div className="relative ml-auto w-56">
              <Icon
                name="search"
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Søk enhet, kode, skjerm …"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </header>

          {filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              {pairings.length === 0
                ? 'Ingen enheter ennå. Start infoskjerm-appen på en Apple TV for å få en kode.'
                : 'Ingen enheter matcher søket.'}
            </p>
          ) : (
            <ul className="divide-y divide-hair">
              {filtered.map((p) => {
                const status = deviceStatus(p);
                const paired = p.status === 'paired';
                const summary = clientSummary(p.client_info);
                return (
                  <li key={p.id}>
                    <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                      <input
                        type="checkbox"
                        checked={selected.has(p.device_id)}
                        onChange={() => toggle(p.device_id)}
                        className="h-4 w-4 shrink-0 rounded border-line accent-brand"
                        aria-label="Velg enhet"
                      />
                      <button
                        type="button"
                        onClick={() => setDetailId(p.device_id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            p.online ? 'bg-ok' : 'bg-muted/40'
                          }`}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink">
                            {displayName(p)}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            <span className="font-mono">{codeDisplay(p.code)}</span>
                            {summary ? ` · ${summary}` : ''}
                          </span>
                        </span>
                      </button>

                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.cls}`}
                      >
                        {status.label}
                      </span>
                      <span className="hidden w-32 shrink-0 truncate text-sm text-muted sm:block">
                        {p.screen_name || '–'}
                      </span>
                      <span className="hidden w-28 shrink-0 text-xs text-muted sm:block">
                        {paired
                          ? p.last_seen
                            ? timeAgo(p.last_seen)
                            : '–'
                          : p.status === 'pending'
                            ? `utløper om ${timeUntil(p.expires_at)}`
                            : ''}
                      </span>
                      <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />
                    </div>
                    {paired && p.screen_id && <DeckPreviewStrip screenId={p.screen_id} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-1 rounded-xl border border-black/20 bg-ink px-2 py-2 text-white shadow-pop">
          <span className="px-2 text-sm font-semibold">{selected.size} valgt</span>
          <span className="mx-1 h-5 w-px bg-white/20" />
          <BulkBtn onClick={() => runCommand(selectedPairedIds, 'reload', 'Last inn')}>Last inn</BulkBtn>
          <BulkBtn onClick={() => runCommand(selectedPairedIds, 'clear_cache', 'Tøm cache')}>
            Tøm cache
          </BulkBtn>
          <BulkBtn onClick={() => runCommand(selectedPairedIds, 'reboot', 'Restart')}>Restart</BulkBtn>
          <select
            value=""
            onChange={(e) => {
              bulkReassign(selectedPairedIds, e.target.value);
              e.target.value = '';
            }}
            className="rounded-lg bg-white/10 px-2 py-1.5 text-xs font-semibold text-white focus:outline-none"
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
          <BulkBtn danger onClick={() => unpairDevices([...selected])}>
            Opphev
          </BulkBtn>
          <span className="mx-1 h-5 w-px bg-white/20" />
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="grid h-7 w-7 place-items-center rounded-lg hover:bg-white/10"
            aria-label="Fjern utvalg"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
      )}

      {detailPairing && (
        <DeviceDetail
          pairing={detailPairing}
          screens={screens}
          onClose={() => setDetailId(null)}
          onCommand={(cmd, label) => runCommand([detailPairing.device_id], cmd, label)}
          onSetLabel={(label) => setLabel(detailPairing.device_id, label)}
          onReassign={(sid) => reassignDevice(detailPairing.device_id, sid)}
          onUnpair={() => unpairDevices([detailPairing.device_id])}
        />
      )}
    </>
  );
}
