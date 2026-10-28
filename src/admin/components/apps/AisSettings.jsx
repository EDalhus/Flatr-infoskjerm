import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import { statusLabel, ago, validMmsi, hasPosition, distanceNm, isMoving, shipClass } from '../../../lib/ais.js';
import FleetMap from '../../../viewer/components/FleetMap.jsx';
import { PlaceSearch } from '../deck/ElementConfigFields.jsx';
import { Icon, Field, Input, Button, IconButton } from '../ui.jsx';
import { Section, SaveBar, Dot } from './parts.jsx';

// Innstillingene til den offisielle appen NAIS (Norsk AIS-tjeneste): BarentsWatch-
// nøkkel, flåten (navn + MMSI) og kaier, med live-kart ved siden av.

const PALETTE = ['#3e63dd', '#e5484d', '#46a758', '#f76b15', '#8e4ec6', '#12a594', '#d6409f', '#ffb224'];
const NO_GROUP = '';

// «FRAMFJORD» -> «Framfjord», «HAV SAGA» -> «Hav Saga» (AIS-navn er store bokstaver).
const niceName = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/(^|[\s\-/])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());

/** Søk etter båter i BarentsWatch på navn eller MMSI, og legg dem til med ett klikk. */
function BoatSearch({ appId, fleet, groups, onAdd, onClose }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits(null);
      setErr('');
      return undefined;
    }
    setBusy(true);
    const t = setTimeout(() => {
      api.apps
        .searchVessels(appId, query)
        .then((r) => {
          setHits(r);
          setErr('');
        })
        .catch((e) => setErr(e.message))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, appId]);

  const inFleet = new Set(fleet.map((b) => b.mmsi));
  const digits = q.replace(/\s/g, '');
  const manual = validMmsi(digits) && !inFleet.has(digits) && !(hits || []).some((h) => h.mmsi === digits);

  return (
    <div className="border-y border-hair bg-zone/50 px-5 py-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søk på båtnavn eller MMSI, f.eks. Framfjord"
            className="pl-9"
            autoFocus
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
        </div>
        <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Gruppe, f.eks. rederi" list="ais-groups" aria-label="Gruppe for båtene du legger til" />
      </div>
      <datalist id="ais-groups">
        {groups.filter(Boolean).map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      <div className="mt-2 text-sm">
        {q.trim().length < 2 ? (
          <p className="m-0 text-xs text-muted">Søker i alle skip med AIS-signal i norske farvann (BarentsWatch). Skriv minst to bokstaver.</p>
        ) : err && !manual ? (
          <p className="m-0 text-xs text-danger">{err}</p>
        ) : busy && !hits && !manual ? (
          <p className="m-0 text-xs text-muted">Søker …</p>
        ) : (
          <>
            {hits?.length === 0 && !manual && (
              <p className="m-0 text-xs text-muted">Ingen båter med det navnet har sendt AIS-signal nylig. Har du MMSI-nummeret, kan du skrive det inn.</p>
            )}
            {(hits?.length > 0 || manual) && (
              <ul className="m-0 max-h-72 list-none divide-y divide-hair overflow-y-auto rounded-xl border border-hair bg-card p-0">
                {manual && (
                  <li className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 text-ink">Legg til MMSI {digits}</span>
                    <Button size="sm" variant="outline" onClick={() => onAdd({ mmsi: digits, name: digits }, group.trim())}>
                      Legg til
                    </Button>
                  </li>
                )}
                {(hits || []).map((h) => {
                  const added = inFleet.has(h.mmsi);
                  const cls = shipClass(h.shipType);
                  return (
                    <li key={h.mmsi} className="flex items-center gap-3 px-3 py-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cls.color }} title={cls.label} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-ink">{niceName(h.name)}</div>
                        <div className="truncate text-xs text-muted">
                          {cls.label}
                          {h.length ? ` · ${h.length} m` : ''}
                          {h.destination ? ` · → ${niceName(h.destination)}` : ''}
                          <span className="font-mono"> · {h.mmsi}</span>
                        </div>
                      </div>
                      {added ? (
                        <span className="shrink-0 text-xs font-semibold text-muted">I flåten</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => onAdd({ mmsi: h.mmsi, name: niceName(h.name) }, group.trim())}>
                          Legg til
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Gruppe på en båt. Lagres når feltet forlates, så båten ikke hopper mellom grupper mens du skriver. */
function GroupInput({ value, label, onCommit }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value.slice(0, 40))}
      onBlur={() => draft.trim() !== value && onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(value);
      }}
      list="ais-groups-all"
      placeholder="+ Gruppe"
      className="w-28 shrink-0 rounded-md bg-transparent px-1.5 py-0.5 text-xs text-muted outline-none placeholder:text-muted/60 hover:bg-zone focus:bg-paper focus:text-ink focus:ring-2 focus:ring-focus/30"
      aria-label={label}
    />
  );
}

/** En gruppe i flåtelista: overskrift med navn, antall og av/på på kartet. */
function GroupHeader({ name, count, hidden, onToggle, onRename }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="flex items-center gap-2 bg-zone/40 px-5 py-1.5">
      {editing && name ? (
        <input
          autoFocus
          defaultValue={name}
          onBlur={(e) => {
            setEditing(false);
            const v = e.target.value.trim();
            if (v && v !== name) onRename(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="h-7 min-w-0 flex-1 rounded-md border border-focus bg-paper px-1.5 text-xs font-semibold text-ink outline-none"
          aria-label="Navn på gruppen"
        />
      ) : (
        <button
          type="button"
          onClick={() => name && setEditing(true)}
          className={`min-w-0 flex-1 truncate text-left text-xs font-semibold uppercase tracking-wide ${hidden ? 'text-muted/60' : 'text-muted'} ${name ? 'hover:text-ink' : 'cursor-default'}`}
          title={name ? 'Klikk for å gi gruppen nytt navn' : undefined}
        >
          {name || 'Uten gruppe'} <span className="font-normal normal-case tracking-normal">· {count}</span>
        </button>
      )}
      <button
        type="button"
        onClick={onToggle}
        className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-muted hover:bg-zone hover:text-ink"
        aria-pressed={!hidden}
        title={hidden ? 'Vis på kartet' : 'Skjul på kartet'}
      >
        {hidden ? 'Skjult på kartet' : 'Vises på kartet'}
      </button>
    </li>
  );
}

export default function AisSettings({ app, onSaved }) {
  const [name, setName] = useState(app.name);
  const [clientId, setClientId] = useState(app.config?.client_id || '');
  const [secret, setSecret] = useState('');
  const [hasSecret, setHasSecret] = useState(app.has_secret);
  const [fleet, setFleet] = useState(app.config?.fleet || []);
  const [quays, setQuays] = useState(app.config?.quays || []);
  const [adding, setAdding] = useState(false);
  // Grupper som er skrudd av på kartet her (bare forhåndsvisningen; widgetene velger selv).
  const [hiddenGroups, setHiddenGroups] = useState(() => new Set());
  const [editConn, setEditConn] = useState(!(app.config?.client_id && app.has_secret));
  const [placing, setPlacing] = useState(false);
  const [focus, setFocus] = useState(null);
  // Sist valgte treff i stedssøket – en kai som plasseres like ved får det navnet.
  const [lastHit, setLastHit] = useState(null);
  const [live, setLive] = useState(null);
  const [liveError, setLiveError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadLive = () =>
    api.apps
      .live(app.id)
      .then((d) => {
        setLive(d);
        setLiveError(d?.ais_error || '');
      })
      .catch((e) => setLiveError(e.message));

  useEffect(() => {
    loadLive();
    const t = setInterval(loadLive, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, app.updated_at]);

  const touch = (fn) => (...args) => {
    fn(...args);
    setDirty(true);
    setNotice('');
  };

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      const body = { name, config: { client_id: clientId, fleet, quays } };
      if (secret.trim()) body.client_secret = secret.trim();
      const saved = await api.apps.update(app.id, body);
      setHasSecret(saved.has_secret);
      setSecret('');
      setFleet(saved.config.fleet);
      setQuays(saved.config.quays);
      setDirty(false);
      setNotice('Lagret.');
      if (saved.config.client_id && saved.has_secret) setEditConn(false);
      onSaved(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    setName(app.name);
    setClientId(app.config?.client_id || '');
    setSecret('');
    setFleet(app.config?.fleet || []);
    setQuays(app.config?.quays || []);
    setPlacing(false);
    setDirty(false);
    setError('');
  };

  const addBoat = touch(({ mmsi, name: boatName }, group) => {
    if (!validMmsi(mmsi)) return setError('MMSI må være 9 siffer.');
    setError('');
    setFleet((list) =>
      list.some((b) => b.mmsi === mmsi)
        ? list
        : [...list, { mmsi, name: boatName || mmsi, color: PALETTE[list.length % PALETTE.length], ...(group ? { group } : {}) }]
    );
  });
  const editBoat = touch((mmsi, patch) =>
    setFleet(
      fleet.map((b) => {
        if (b.mmsi !== mmsi) return b;
        const next = { ...b, ...patch };
        if (!next.group) delete next.group;
        return next;
      })
    )
  );
  const removeBoat = touch((mmsi) => setFleet(fleet.filter((b) => b.mmsi !== mmsi)));
  const renameGroup = touch((from, to) => setFleet(fleet.map((b) => (b.group === from ? { ...b, group: to } : b))));
  const toggleGroup = (g) =>
    setHiddenGroups((s) => {
      const next = new Set(s);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  // Gruppene i flåten, alfabetisk, «Uten gruppe» sist.
  const groupNames = [...new Set(fleet.map((b) => b.group || NO_GROUP))].sort((a, b) => (a ? (b ? a.localeCompare(b, 'nb') : -1) : 1));
  const grouped = groupNames.length > 1 || (groupNames.length === 1 && groupNames[0] !== NO_GROUP);

  // Ny kai: navnet fra stedssøket hvis du klikket like ved treffet, ellers
  // nærmeste stedsnavn fra Kartverket (kai/havn/brygge foretrekkes). Kan endres.
  const placeQuay = touch((lat, lon) => {
    const id = Math.random().toString(36).slice(2, 10);
    const point = { lat: +lat.toFixed(5), lon: +lon.toFixed(5) };
    const nearHit = lastHit && distanceNm(lastHit, point) < 0.8 ? lastHit.name : null;
    const fallback = `Kai ${quays.length + 1}`;
    setQuays((list) => [...list, { id, name: nearHit || fallback, ...point }]);
    setPlacing(false);
    if (nearHit) return;
    fetch(`/api/feeds?type=nearest&lat=${point.lat}&lon=${point.lon}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!res?.name) return;
        // Bare hvis du ikke allerede har gitt kaia et eget navn.
        setQuays((list) => list.map((q) => (q.id === id && q.name === fallback ? { ...q, name: res.name } : q)));
      })
      .catch(() => {});
  });
  const editQuay = touch((i, patch) => setQuays(quays.map((q, j) => (j === i ? { ...q, ...patch } : q))));
  const removeQuay = touch((i) => setQuays(quays.filter((_, j) => j !== i)));

  const liveByMmsi = new Map((live?.vessels || []).map((v) => [String(v.mmsi), v]));
  // Kartet viser lagrede navn/farger, men live-posisjoner.
  const mapVessels = fleet
    .filter((b) => !hiddenGroups.has(b.group || NO_GROUP))
    .map((b) => ({ ...(liveByMmsi.get(b.mmsi) || { missing: true }), ...b }));

  const connected = !!(clientId && hasSecret && live && !liveError);
  const focusOn = (v) => v && hasPosition(v) && setFocus({ lat: v.lat, lon: v.lon, zoom: 11 });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="min-w-0 space-y-5">
        {/* --- tilkobling --- */}
        <Section
          icon="link"
          title="BarentsWatch"
          hint={editConn ? 'Hver konto bruker sin egen gratis API-klient av typen AIS. Steg-for-steg finner du under «Om appen».' : null}
          action={
            !editConn && (
              <Button variant="ghost" size="sm" onClick={() => setEditConn(true)}>
                Endre
              </Button>
            )
          }
          flush={!editConn}
        >
          {editConn ? (
            <div className="grid gap-4">
              <Field label="Client id" hint="Lag klienten på barentswatch.no → Min side → API-klienter (type AIS).">
                <Input value={clientId} onChange={(e) => touch(setClientId)(e.target.value)} placeholder="din@epost.no:flatr" autoComplete="off" />
              </Field>
              <Field label="Client secret" hint={hasSecret ? 'Lagret og kryptert. Skriv inn en ny for å bytte.' : 'Lagres kryptert og vises aldri igjen.'}>
                <Input type="password" value={secret} onChange={(e) => touch(setSecret)(e.target.value)} placeholder={hasSecret ? '••••••••••••' : ''} autoComplete="new-password" />
              </Field>
              <Field label="Navn i editoren">
                <Input value={name} onChange={(e) => touch(setName)(e.target.value)} />
              </Field>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-5 pb-4 text-sm">
              <Dot tone={connected ? 'ok' : liveError ? 'bad' : 'muted'} />
              <span className="text-ink">{connected ? 'Tilkoblet' : liveError ? 'Får ikke kontakt' : 'Kobler til …'}</span>
              <span className="truncate text-muted">· {liveError || clientId}</span>
            </div>
          )}
        </Section>

        {/* --- flåten --- */}
        <Section
          icon="pin"
          title="Flåten"
          count={fleet.length}
          action={
            <Button variant={adding ? 'ghost' : 'outline'} size="sm" onClick={() => setAdding(!adding)}>
              <Icon name={adding ? 'x' : 'plus'} className="h-4 w-4" />
              {adding ? 'Avbryt' : 'Legg til båt'}
            </Button>
          }
          flush
        >
          {adding && <BoatSearch appId={app.id} fleet={fleet} groups={groupNames} onAdd={addBoat} onClose={() => setAdding(false)} />}
          {fleet.length === 0 && !adding && <p className="m-0 px-5 pb-5 text-sm text-muted">Ingen båter ennå. Trykk «Legg til båt» og søk på navnet.</p>}
          {fleet.length > 0 && (
            <ul className="m-0 list-none divide-y divide-hair border-t border-hair p-0">
              {groupNames.map((g) => {
                const boats = fleet.filter((b) => (b.group || NO_GROUP) === g);
                return [
                  grouped && (
                    <GroupHeader
                      key={`g-${g}`}
                      name={g}
                      count={boats.length}
                      hidden={hiddenGroups.has(g)}
                      onToggle={() => toggleGroup(g)}
                      onRename={(to) => renameGroup(g, to)}
                    />
                  ),
                  ...boats.map((b) => {
                    const v = liveByMmsi.get(b.mmsi);
                    const found = v && !v.missing;
                    return (
                      <li key={b.mmsi} className={`group flex items-center gap-3 px-5 py-2.5 hover:bg-zone/50 ${hiddenGroups.has(g) ? 'opacity-60' : ''}`}>
                        <Dot tone={!live ? 'muted' : !found ? 'bad' : isMoving(v) ? 'ok' : 'warn'} title={found ? statusLabel(v) : 'Ikke funnet i AIS'} />
                        <input
                          value={b.name}
                          onChange={(e) => editBoat(b.mmsi, { name: e.target.value })}
                          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm font-medium text-ink outline-none hover:bg-zone focus:bg-paper focus:ring-2 focus:ring-focus/30"
                          aria-label="Navn"
                        />
                        <GroupInput value={b.group || ''} label={`Gruppe for ${b.name}`} onCommit={(group) => editBoat(b.mmsi, { group })} />
                        <span className="hidden font-mono text-xs text-muted lg:inline">{b.mmsi}</span>
                        <button
                          type="button"
                          onClick={() => focusOn(v)}
                          disabled={!found}
                          className="w-36 shrink-0 truncate text-right text-xs text-muted enabled:hover:text-ink"
                          title={found ? 'Vis på kartet' : undefined}
                        >
                          {!live ? '' : found ? `${statusLabel(v)} · ${ago(v.msgtime).replace(/^for /, '').replace(/ siden$/, '')}` : <span className="text-danger">Ikke funnet i AIS</span>}
                        </button>
                        <IconButton name="x" label={`Fjern ${b.name}`} tone="danger" onClick={() => removeBoat(b.mmsi)} className="opacity-0 group-hover:opacity-100 focus:opacity-100" />
                      </li>
                    );
                  })
                ];
              })}
            </ul>
          )}
          <datalist id="ais-groups-all">
            {groupNames.filter(Boolean).map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Section>

        {/* --- kaier --- */}
        <Section
          icon="home"
          title="Kaier"
          count={quays.length}
          hint="Brukes til ETA og ankomsttavler."
          action={
            <Button variant={placing ? 'primary' : 'outline'} size="sm" onClick={() => setPlacing(!placing)}>
              <Icon name={placing ? 'x' : 'plus'} className="h-4 w-4" />
              {placing ? 'Avbryt' : 'Ny kai'}
            </Button>
          }
          flush
        >
          {placing && (
            <p className="m-0 flex items-center gap-2 border-y border-brand/30 bg-brand-tint px-5 py-2.5 text-sm font-medium text-brand">
              <Icon name="pin" className="h-4 w-4" /> Søk eller zoom i kartet, og klikk der kaia ligger.
            </p>
          )}
          {quays.length === 0 && !placing && <p className="m-0 px-5 pb-5 text-sm text-muted">Ingen kaier ennå.</p>}
          {quays.length > 0 && (
            <ul className="m-0 list-none divide-y divide-hair border-t border-hair p-0">
              {quays.map((q, i) => (
                <li key={q.id} className="group flex items-center gap-3 px-5 py-2.5 hover:bg-zone/50">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-slate-400" />
                  <input
                    value={q.name}
                    onChange={(e) => editQuay(i, { name: e.target.value })}
                    className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm font-medium text-ink outline-none hover:bg-zone focus:bg-paper focus:ring-2 focus:ring-focus/30"
                    aria-label="Kallenavn på kaia (vises på kartet)"
                    placeholder="Kallenavn"
                  />
                  <span className="hidden font-mono text-xs text-muted sm:inline">
                    {q.lat.toFixed(4)}, {q.lon.toFixed(4)}
                  </span>
                  <IconButton name="search" label="Vis på kartet" onClick={() => setFocus({ lat: q.lat, lon: q.lon, zoom: 15 })} />
                  <IconButton name="x" label="Fjern kaia" tone="danger" onClick={() => removeQuay(i)} className="opacity-0 group-hover:opacity-100 focus:opacity-100" />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* --- kart --- */}
      <div className="min-w-0">
        <div className="sticky top-4">
          <div className="relative h-[calc(100vh-220px)] min-h-[420px] overflow-hidden rounded-2xl border border-hair">
            <FleetMap
              vessels={mapVessels}
              quays={quays}
              area={mapVessels.some(hasPosition) || quays.length ? 'fleet' : 'norway'}
              onPick={placing ? placeQuay : undefined}
              interactive
              focus={focus}
              legend
            />
            <div className="absolute left-3 top-3 z-10 w-72 max-w-[calc(100%-4.5rem)]">
              <PlaceSearch
                placeholder={placing ? 'Søk etter kaia, f.eks. Skateflukaia' : 'Søk etter et sted'}
                onPick={(h) => {
                  setFocus({ lat: h.lat, lon: h.lon, zoom: 15 });
                  setLastHit({ name: h.name, lat: h.lat, lon: h.lon });
                }}
              />
            </div>
          </div>
          {grouped && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted">Vis på kartet:</span>
              {groupNames.map((g) => {
                const on = !hiddenGroups.has(g);
                return (
                  <button
                    key={g || '-'}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleGroup(g)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${on ? 'bg-brand text-onbrand' : 'bg-zone text-muted line-through hover:text-ink'}`}
                  >
                    {g || 'Uten gruppe'}
                  </button>
                );
              })}
            </div>
          )}
          <p className="m-0 mt-2 text-xs text-muted">
            {liveError ? `Kunne ikke hente AIS: ${liveError}` : live ? `AIS oppdatert ${ago(live.fetched_at)}${live.stale ? ' (viser siste kjente)' : ''}` : 'Henter AIS …'}
          </p>
        </div>
      </div>

      <SaveBar dirty={dirty} busy={busy} error={error} onSave={save} onDiscard={discard} />
    </div>
  );
}
