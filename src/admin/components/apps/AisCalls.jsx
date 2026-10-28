import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api.js';
import { etaTo, etaText } from '../../../lib/ais.js';
import { CARGO_DIRS, UNITS, currentCalls, cargoText, callTimeText, callDate, hasClock, parseCallTable, cleanCalls } from '../../../lib/portCalls.js';
import { Icon, Field, Input, Select, Button, IconButton } from '../ui.jsx';
import { Section } from './parts.jsx';

// Tillegget «Anløp» i NAIS: kjente båtanløp med kai, forventet ankomst og
// avgang, neste havn og varer som leveres eller hentes. Båter fra flåten får
// live status fra AIS. Lagres i NAIS-appens config.calls (src/lib/portCalls.js).

const pad = (n) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Dato og valgfritt klokkeslett. Lagres som "YYYY-MM-DD" eller "YYYY-MM-DDTHH:MM". */
function DateTimeInput({ value, onChange, min, required, label }) {
  const date = (value || '').slice(0, 10);
  const clock = (value || '').slice(11, 16);
  const join = (d, t) => (d ? (t ? `${d}T${t}` : d) : '');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
      <Input type="date" value={date} min={min?.slice(0, 10)} onChange={(e) => onChange(join(e.target.value, clock))} required={required} aria-label={`${label} dato`} />
      <Input
        type="time"
        value={clock}
        onChange={(e) => onChange(join(date, e.target.value))}
        disabled={!date}
        aria-label={`${label} klokkeslett (valgfritt)`}
        title="Valgfritt – la stå tomt hvis klokkeslettet ikke er kjent"
      />
    </div>
  );
}
const newId = () => Math.random().toString(36).slice(2, 10);
const OTHER = '__other';

function blankCall(quays) {
  return { id: newId(), mmsi: null, name: '', quayId: quays[0]?.id || null, eta: today(), etd: '', from: '', next: '', cargo: [], note: '' };
}

function CallForm({ initial, fleet, quays, goodsList, onSave, onCancel, onDelete, busy }) {
  const [c, setC] = useState(initial);
  const [other, setOther] = useState(!initial.mmsi && !!initial.name);
  const set = (patch) => setC((x) => ({ ...x, ...patch }));
  const setCargo = (i, patch) => set({ cargo: c.cargo.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  const boatValue = other ? OTHER : c.mmsi || '';
  // Avgang kan ikke være før ankomst (sammenlign dato når et klokkeslett mangler).
  const etdOk = !c.etd || (hasClock(c.etd) && hasClock(c.eta) ? c.etd >= c.eta : c.etd.slice(0, 10) >= c.eta.slice(0, 10));
  const valid = c.eta && (c.mmsi || c.name.trim()) && etdOk;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ ...c, cargo: c.cargo.filter((g) => g.goods.trim()) });
      }}
      className="grid gap-4 border-y border-hair bg-zone/40 px-5 py-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Båt">
          <Select
            value={boatValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === OTHER) {
                setOther(true);
                set({ mmsi: null });
              } else {
                setOther(false);
                set({ mmsi: v || null, name: '' });
              }
            }}
          >
            <option value="">Velg båt …</option>
            {fleet.map((b) => (
              <option key={b.mmsi} value={b.mmsi}>
                {b.name}
              </option>
            ))}
            <option value={OTHER}>Annen båt (ikke i flåten)</option>
          </Select>
        </Field>
        {other ? (
          <Field label="Navn på båten" hint="Uten MMSI får anløpet ingen live status fra AIS.">
            <Input value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder="F.eks. MS Nordkyn" autoFocus />
          </Field>
        ) : (
          <Field label="Kai">
            <Select value={c.quayId || ''} onChange={(e) => set({ quayId: e.target.value || null })}>
              {!quays.length && <option value="">Ingen kaier – legg dem inn under Oppsett</option>}
              {quays.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {other && (
          <Field label="Kai">
            <Select value={c.quayId || ''} onChange={(e) => set({ quayId: e.target.value || null })}>
              {!quays.length && <option value="">Ingen kaier – legg dem inn under Oppsett</option>}
              {quays.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Forventet ankomst" hint="Klokkeslett er valgfritt.">
          <DateTimeInput label="Ankomst" value={c.eta} onChange={(eta) => set({ eta })} required />
        </Field>
        <Field label="Forventet avgang (valgfritt)" hint={!etdOk ? 'Avgang må være etter ankomst.' : null}>
          <DateTimeInput label="Avgang" value={c.etd || ''} min={c.eta} onChange={(etd) => set({ etd })} />
        </Field>
        <Field label="Kommer fra (valgfritt)">
          <Input value={c.from || ''} onChange={(e) => set({ from: e.target.value })} placeholder="F.eks. Rotterdam" />
        </Field>
        <Field label="Neste havn">
          <Input value={c.next || ''} onChange={(e) => set({ next: e.target.value })} placeholder="F.eks. Bergen" />
        </Field>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold text-muted">Varer</div>
        <div className="grid gap-2">
          {c.cargo.map((g, i) => (
            <div key={i} className="grid grid-cols-[110px_minmax(0,1fr)_90px_110px_auto] items-center gap-2">
              <Select value={g.dir} onChange={(e) => setCargo(i, { dir: e.target.value })} aria-label="Leverer eller henter">
                {CARGO_DIRS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.icon} {d.label}
                  </option>
                ))}
              </Select>
              <Input value={g.goods} onChange={(e) => setCargo(i, { goods: e.target.value })} placeholder="Vare, f.eks. olivin" list="call-goods" aria-label="Vare" />
              <Input type="number" min="0" step="any" value={g.qty ?? ''} onChange={(e) => setCargo(i, { qty: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Mengde" aria-label="Mengde" />
              <Select value={g.unit || 'tonn'} onChange={(e) => setCargo(i, { unit: e.target.value })} aria-label="Enhet">
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
              <IconButton name="x" label="Fjern varelinjen" tone="danger" onClick={() => set({ cargo: c.cargo.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <datalist id="call-goods">
            {goodsList.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => set({ cargo: [...c.cargo, { dir: c.cargo.at(-1)?.dir || 'unload', goods: '', qty: null, unit: c.cargo.at(-1)?.unit || 'tonn' }] })}
            className="justify-self-start text-sm font-semibold text-brand hover:underline"
          >
            + Legg til vare
          </button>
        </div>
      </div>

      <Field label="Merknad (valgfritt)">
        <Input value={c.note || ''} onChange={(e) => set({ note: e.target.value })} placeholder="Vises bare her, ikke på skjermene" />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!valid || busy}>
          {busy ? 'Lagrer …' : 'Lagre anløp'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Avbryt
        </Button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="ml-auto text-sm font-semibold text-danger hover:underline">
            Slett anløpet
          </button>
        )}
      </div>
    </form>
  );
}

/** Importer anløp: lim inn fra Excel, e-post eller notater. Claude AI tolker fri tekst; tabeller leses direkte. */
function ImportCalls({ fleet, quays, onAdd, onClose, busy }) {
  const [text, setText] = useState('');
  const [found, setFound] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [ai, setAi] = useState(null);
  useEffect(() => {
    api.ai.app().then((r) => setAi(!!r?.app?.has_key)).catch(() => setAi(false));
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  const show = (calls) => {
    const clean = cleanCalls(calls.map((c) => ({ ...c, id: Math.random().toString(36).slice(2, 10) })));
    setFound(clean);
    setPicked(new Set(clean.map((c) => c.id)));
    if (!clean.length) setError('Fant ingen anløp. Har tabellen en overskriftsrad med f.eks. «Båt» og «Dato»?');
  };
  const byAi = async () => {
    setWorking(true);
    setError('');
    try {
      show((await api.ai.parseCalls(text)).calls || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  };
  const boatName = (c) => c.name || fleet.find((b) => b.mmsi === c.mmsi)?.name || c.mmsi;
  return (
    <div className="grid gap-3 border-y border-hair bg-zone/40 px-5 py-4">
      <div className="text-sm text-ink">
        <strong>Importer anløp</strong>
        <span className="text-muted"> – lim inn rader fra Excel, en e-post fra rederiet eller egne notater.</span>
      </div>
      <textarea
        rows={7}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'F.eks.\nBåt\tKai\tDato\tTid\tNeste havn\tVare\tMengde\tEnhet\tRetning\nFramfjord\tSkutvika\t02.11\t14:30\tBergen\tOlivin\t3500\ttonn\tLasting\n\neller fri tekst: «Holmfoss kommer onsdag til Ålesund og henter 200 big bags Sea …»'}
        className="rounded-xl border border-line bg-paper px-3 py-2 font-mono text-xs text-ink outline-none focus:border-focus"
      />
      <div className="flex flex-wrap items-center gap-2">
        {ai && (
          <Button size="sm" onClick={byAi} disabled={working || !text.trim()}>
            <Icon name="sparkle" className="h-4 w-4" />
            {working ? 'Claude leser …' : 'Tolk med Claude AI'}
          </Button>
        )}
        <Button size="sm" variant={ai ? 'outline' : 'primary'} onClick={() => (setError(''), show(parseCallTable(text, { fleet, quays, today })))} disabled={working || !text.trim()}>
          Les som tabell
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Avbryt
        </Button>
        {ai === false && <span className="text-xs text-muted">Med Claude AI kan du også lime inn fri tekst og e-poster.</span>}
      </div>
      {error && <p className="m-0 text-xs text-danger">{error}</p>}
      {found?.length > 0 && (
        <div className="grid gap-2">
          <ul className="m-0 list-none divide-y divide-hair rounded-xl border border-hair bg-card p-0">
            {found.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={picked.has(c.id)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(c.id);
                    else next.delete(c.id);
                    setPicked(next);
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-ink">
                    <strong>{callTimeText(c.eta)}</strong> · {boatName(c)}
                    {!c.mmsi && <span className="text-xs text-muted"> (ikke i flåten)</span>} · {quays.find((q) => q.id === c.quayId)?.name || <span className="text-warn">ukjent kai</span>}
                  </div>
                  <div className="truncate text-xs text-muted">{[c.next && `→ ${c.next}`, cargoText(c.cargo)].filter(Boolean).join('  ·  ')}</div>
                </div>
              </li>
            ))}
          </ul>
          <Button size="sm" className="justify-self-start" disabled={busy || !picked.size} onClick={() => onAdd(found.filter((c) => picked.has(c.id)))}>
            Legg til {picked.size} anløp
          </Button>
        </div>
      )}
    </div>
  );
}

/** Varer levert og hentet de siste N dagene (fra registrerte anløp). */
function CargoReport({ calls, days }) {
  const since = Date.now() - days * 86_400_000;
  const totals = new Map();
  for (const c of calls) {
    const t = callDate(c.eta).getTime();
    if (t < since || t > Date.now()) continue;
    for (const g of c.cargo) {
      const key = `${g.dir}|${g.goods.toLowerCase()}|${g.unit || ''}`;
      const cur = totals.get(key) || { dir: g.dir, goods: g.goods, unit: g.unit, qty: 0, calls: 0 };
      cur.qty += g.qty || 0;
      cur.calls += 1;
      totals.set(key, cur);
    }
  }
  const rows = [...totals.values()].sort((a, b) => a.dir.localeCompare(b.dir) || b.qty - a.qty);
  if (!rows.length) return <p className="m-0 px-5 pb-4 text-sm text-muted">Ingen varer registrert de siste {days} dagene.</p>;
  return (
    <div className="px-5 pb-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-semibold">Vare</th>
            <th className="py-1 font-semibold">Retning</th>
            <th className="py-1 text-right font-semibold">Mengde</th>
            <th className="py-1 text-right font-semibold">Anløp</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hair">
          {rows.map((r) => (
            <tr key={`${r.dir}${r.goods}${r.unit}`}>
              <td className="py-1.5 text-ink">{r.goods}</td>
              <td className="py-1.5 text-muted">{r.dir === 'load' ? '↑ Hentet' : '↓ Levert'}</td>
              <td className="py-1.5 text-right tabular-nums text-ink">{r.qty ? `${r.qty.toLocaleString('nb-NO')} ${r.unit || ''}` : '–'}</td>
              <td className="py-1.5 text-right tabular-nums text-muted">{r.calls}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AisCalls({ app, onSaved }) {
  const fleet = app.config?.fleet || [];
  const quays = app.config?.quays || [];
  const [calls, setCalls] = useState(app.config?.calls || []);
  const [editing, setEditing] = useState(null); // id | 'new'
  const [showPast, setShowPast] = useState(false);
  const [reportDays, setReportDays] = useState(30);
  const [quayFilter, setQuayFilter] = useState('');
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hook, setHook] = useState(null);
  const now = Date.now();
  useEffect(() => {
    api.settings.get().then((s) => setHook(s.webhook || false)).catch(() => setHook(false));
  }, []);
  const setNotify = async (on) => {
    try {
      onSaved(await api.apps.update(app.id, { config: { calls_notify: on } }));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => setCalls(app.config?.calls || []), [app.updated_at]);
  useEffect(() => {
    const load = () => api.apps.live(app.id).then(setLive).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [app.id]);

  const save = async (next) => {
    setBusy(true);
    setError('');
    try {
      const saved = await api.apps.update(app.id, { config: { calls: next } });
      setCalls(saved.config.calls || []);
      onSaved(saved);
      setEditing(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const byMmsi = new Map((live?.vessels || []).map((v) => [String(v.mmsi), v]));
  const quayById = new Map(quays.map((q) => [q.id, q]));
  const goodsList = useMemo(() => [...new Set(calls.flatMap((c) => c.cargo.map((g) => g.goods)))].sort((a, b) => a.localeCompare(b, 'nb')), [calls]);

  const upcoming = currentCalls(calls, { now, days: 3650, quayId: quayFilter || null });
  const upcomingIds = new Set(upcoming.map((c) => c.id));
  const past = calls.filter((c) => !upcomingIds.has(c.id) && (!quayFilter || c.quayId === quayFilter) && callDate(c.eta).getTime() < now).reverse();
  const list = showPast ? past : upcoming;

  // Grupper etter dag.
  const days = [];
  for (const c of list) {
    const key = callDate(c.eta).toDateString();
    let day = days.find((d) => d.key === key);
    if (!day) days.push((day = { key, label: callDate(c.eta).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }), calls: [] }));
    day.calls.push(c);
  }

  return (
    <div className="grid max-w-5xl gap-5">
      <Section
        icon="calendar"
        title="Anløp"
        count={upcoming.length}
        hint="Båtanløp dere vet om: kai, forventet ankomst og avgang, neste havn og varer. Vis dem på skjermene med NAIS → Anløpsplan i editoren."
        action={
          editing !== 'new' &&
          editing !== 'import' && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing('import')}>
                Importer
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
                <Icon name="plus" className="h-4 w-4" />
                Nytt anløp
              </Button>
            </div>
          )
        }
        flush
      >
        {editing === 'import' && <ImportCalls fleet={fleet} quays={quays} busy={busy} onClose={() => setEditing(null)} onAdd={(list) => save([...calls, ...list])} />}
        {editing === 'new' && (
          <CallForm
            initial={blankCall(quays)}
            fleet={fleet}
            quays={quays}
            goodsList={goodsList}
            busy={busy}
            onSave={(c) => save([...calls, c])}
            onCancel={() => setEditing(null)}
          />
        )}

        <label className="flex items-start gap-2 border-t border-hair px-5 py-3 text-sm text-muted">
          <input type="checkbox" className="mt-0.5" checked={!!app.config?.calls_notify} disabled={hook === false} onChange={(e) => setNotify(e.target.checked)} />
          <span>
            <span className="font-semibold text-ink">Varsle i {hook?.kind === 'teams' ? 'Teams' : 'Slack/Teams'}</span> når en båt fra flåten nærmer seg kaia (under en time), ankommer, eller er mer enn en time forsinket.
            {hook === false && (
              <>
                {' '}
                Koble til Slack eller Teams under{' '}
                <a href="/admin?view=screens" className="font-semibold text-brand hover:underline">
                  Skjermer
                </a>{' '}
                først.
              </>
            )}
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2 border-t border-hair px-5 py-3">
          <div className="flex rounded-full bg-zone p-0.5 text-xs font-semibold">
            {[
              [false, 'Kommende'],
              [true, 'Tidligere']
            ].map(([v, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setShowPast(v)}
                className={`rounded-full px-3 py-1.5 ${showPast === v ? 'bg-card text-ink shadow-card' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {quays.length > 1 && (
            <select value={quayFilter} onChange={(e) => setQuayFilter(e.target.value)} className="h-8 rounded-lg border border-line bg-paper px-2 text-xs text-ink" aria-label="Kai">
              <option value="">Alle kaier</option>
              {quays.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          )}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>

        {showPast && (
          <div className="border-t border-hair">
            <div className="flex items-center gap-2 px-5 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Varer
              <select value={reportDays} onChange={(e) => setReportDays(Number(e.target.value))} className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-xs normal-case text-ink">
                {[30, 90, 365].map((d) => (
                  <option key={d} value={d}>
                    siste {d} dager
                  </option>
                ))}
              </select>
            </div>
            <CargoReport calls={calls.filter((c) => !quayFilter || c.quayId === quayFilter)} days={reportDays} />
          </div>
        )}

        {!list.length && (
          <p className="m-0 px-5 pb-5 text-sm text-muted">
            {showPast ? 'Ingen tidligere anløp.' : quays.length ? 'Ingen kommende anløp. Trykk «Nytt anløp» for å legge inn det første.' : 'Legg først inn kaiene under Oppsett, så kan du registrere anløp.'}
          </p>
        )}

        {days.map((d) => (
          <div key={d.key}>
            <div className="border-t border-hair bg-zone/40 px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{d.label}</div>
            <ul className="m-0 list-none divide-y divide-hair p-0">
              {d.calls.map((c) =>
                editing === c.id ? (
                  <li key={c.id}>
                    <CallForm
                      initial={{ ...c, etd: c.etd || '', from: c.from || '', next: c.next || '', note: c.note || '', name: c.name || '' }}
                      fleet={fleet}
                      quays={quays}
                      goodsList={goodsList}
                      busy={busy}
                      onSave={(next) => save(calls.map((x) => (x.id === c.id ? next : x)))}
                      onCancel={() => setEditing(null)}
                      onDelete={() => save(calls.filter((x) => x.id !== c.id))}
                    />
                  </li>
                ) : (
                  <CallRow key={c.id} c={c} vessel={byMmsi.get(String(c.mmsi))} boat={fleet.find((b) => b.mmsi === c.mmsi)} quay={quayById.get(c.quayId)} now={now} onEdit={() => setEditing(c.id)} />
                )
              )}
            </ul>
          </div>
        ))}
      </Section>
    </div>
  );
}

function CallRow({ c, vessel, boat, quay, now, onEdit }) {
  const live = vessel && !vessel.missing && quay ? etaTo(vessel, quay, now) : null;
  const late = hasClock(c.eta) && live?.state === 'eta' && live.eta.getTime() - callDate(c.eta).getTime() > 3600_000;
  return (
    <li>
      <button type="button" onClick={onEdit} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-zone/50">
        <div className="w-28 shrink-0">
          <div className="text-sm font-semibold tabular-nums text-ink">{callTimeText(c.eta, now)}</div>
          {c.etd && <div className="text-xs tabular-nums text-muted">avg. {callTimeText(c.etd, now)}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            {boat && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: boat.color }} />}
            <span className="truncate font-semibold text-ink">{c.name || boat?.name || c.mmsi}</span>
            {quay && <span className="truncate text-muted">· {quay.name}</span>}
          </div>
          <div className="truncate text-xs text-muted">
            {[c.from && `fra ${c.from}`, c.next && `→ ${c.next}`].filter(Boolean).join('  ')}
            {c.cargo.length > 0 && `${c.from || c.next ? '  ·  ' : ''}${cargoText(c.cargo)}`}
            {c.note && `  ·  ${c.note}`}
          </div>
        </div>
        <div className="w-40 shrink-0 text-right text-xs">
          {live ? (
            <span className={`font-semibold ${live.state === 'arrived' ? 'text-ok' : late ? 'text-warn' : 'text-ink'}`}>
              {live.state === 'arrived' ? 'Ved kai nå' : `Live: ${etaText(live)}`}
              {late && ' · forsinket'}
            </span>
          ) : (
            <span className="text-muted">{c.mmsi ? 'Venter på AIS' : 'Ingen live data'}</span>
          )}
        </div>
      </button>
    </li>
  );
}
