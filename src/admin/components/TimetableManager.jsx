// Tidsplan – hva hver kanal viser når. Ukekalender pr. kanal med regler
// (presentasjon eller «skjerm av»), overstyring og kontoens tidssone.
// Samme beregning som serveren (src/lib/timeslots.js).

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import {
  activeSlot,
  addDays,
  localParts,
  weekBlocks,
  windowOf,
  parseDays,
  fromMin,
  toMin,
  DAY_LABELS,
  PRIORITY
} from '../../lib/timeslots.js';
import { Icon, Field, Input, Select, Button, IconButton, PageHeader, ErrorText } from './ui.jsx';
import { tr, locale } from '../../lib/i18n.js';

const HOUR_PX = 44;
const COLORS = ['#027353', '#3e63dd', '#c2410c', '#8e4ec6', '#0d9488', '#b91c1c', '#a16207', '#d6409f'];
const colorFor = (slot) => (slot.kind === 'off' ? '#3f3f46' : COLORS[(slot.playlist_id || 0) % COLORS.length]);
const TIMEZONES = ['Europe/Oslo', 'Europe/Stockholm', 'Europe/Copenhagen', 'Europe/Helsinki', 'Europe/London', 'UTC', 'America/New_York'];

const fmtDate = (date, opts) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), { timeZone: 'UTC', ...opts });

function isoWeek(date) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/** Lesbar oppsummering: «Man–fre · 07:00–10:00 · 1.–24. des». */
export function describeSlot(s) {
  const days = parseDays(s.days);
  let d = 'Hver dag';
  if (days.length) {
    const key = days.join(',');
    d =
      key === '1,2,3,4,5'
        ? 'Hverdager'
        : key === '6,7'
          ? 'Helg'
          : days.map((n) => DAY_LABELS[n - 1].toLowerCase()).join(', ');
    d = d.charAt(0).toUpperCase() + d.slice(1);
  }
  const t = s.start_time || s.end_time ? `${s.start_time || '00:00'}–${s.end_time || '24:00'}` : 'hele dagen';
  const range =
    s.start_date || s.end_date
      ? ` · ${s.start_date ? fmtDate(s.start_date, { day: 'numeric', month: 'short' }) : '…'}–${
          s.end_date ? fmtDate(s.end_date, { day: 'numeric', month: 'short', year: 'numeric' }) : '…'
        }`
      : '';
  return `${d} · ${t}${range}`;
}

/* ------------------------------ regel-editor ------------------------------ */

function RuleEditor({ initial, playlists, onSave, onDelete, onClose }) {
  const [f, setF] = useState(() => ({
    title: initial.title || '',
    target: initial.kind === 'off' ? 'off' : String(initial.playlist_id || playlists[0]?.id || ''),
    days: parseDays(initial.days),
    allDay: !initial.start_time && !initial.end_time,
    start_time: initial.start_time || '08:00',
    end_time: initial.end_time || '16:00',
    dated: !!(initial.start_date || initial.end_date),
    start_date: initial.start_date || '',
    end_date: initial.end_date || '',
    priority: Number(initial.priority) >= PRIORITY.high ? PRIORITY.high : PRIORITY.normal,
    enabled: initial.enabled !== 0
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  const toggleDay = (n) => set({ days: f.days.includes(n) ? f.days.filter((d) => d !== n) : [...f.days, n].sort() });
  const preset = (days) => set({ days });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({
        title: f.title || null,
        kind: f.target === 'off' ? 'off' : 'playlist',
        playlist_id: f.target === 'off' ? null : Number(f.target),
        days: f.days,
        start_time: f.allDay ? null : f.start_time,
        end_time: f.allDay ? null : f.end_time,
        start_date: f.dated ? f.start_date || null : null,
        end_date: f.dated ? f.end_date || null : null,
        priority: f.priority,
        enabled: f.enabled
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const overnight = !f.allDay && toMin(f.end_time) != null && toMin(f.end_time) < toMin(f.start_time);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={initial.id ? tr('Rediger regel') : tr('Ny regel')}
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-3xl border border-line bg-card p-6 shadow-pop"
      >
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold text-ink">{initial.id ? tr('Rediger regel') : tr('Ny regel')}</h2>
          <IconButton name="x" label={tr('Lukk')} onClick={onClose} />
        </div>

        <Field label={tr('Viser')}>
          <Select value={f.target} onChange={(e) => set({ target: e.target.value })}>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="off">{tr('Skjerm av (svart)')}</option>
          </Select>
        </Field>

        <Field label={tr('Navn (valgfritt)')}>
          <Input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder={tr('F.eks. Frokost')} />
        </Field>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 text-xs font-semibold text-muted">{tr('Dager')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(i + 1)}
                aria-pressed={f.days.includes(i + 1)}
                className={`h-9 w-12 rounded-lg text-sm font-semibold transition-colors ${
                  f.days.includes(i + 1) ? 'bg-brand text-onbrand' : 'border border-line bg-paper text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-3 text-xs font-semibold">
            <button type="button" className="text-brand hover:underline" onClick={() => preset([1, 2, 3, 4, 5])}>
              {tr('Hverdager')}
            </button>
            <button type="button" className="text-brand hover:underline" onClick={() => preset([6, 7])}>
              {tr('Helg')}
            </button>
            <button type="button" className="text-brand hover:underline" onClick={() => preset([])}>
              {tr('Hver dag')}
            </button>
          </div>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 text-xs font-semibold text-muted">{tr('Tid')}</legend>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={f.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
            {tr('Hele dagen')}
          </label>
          {!f.allDay && (
            <div className="flex items-center gap-2">
              <Input type="time" value={f.start_time} onChange={(e) => set({ start_time: e.target.value })} aria-label={tr('Fra')} />
              <span className="text-muted">–</span>
              <Input type="time" value={f.end_time} onChange={(e) => set({ end_time: e.target.value })} aria-label={tr('Til')} />
            </div>
          )}
          {overnight && <p className="m-0 text-xs text-muted">{tr('Går over midnatt – slutter dagen etter.')}</p>}
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 text-xs font-semibold text-muted">{tr('Periode')}</legend>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={f.dated} onChange={(e) => set({ dated: e.target.checked })} />
            {tr('Bare i en bestemt periode')}
          </label>
          {f.dated && (
            <div className="flex items-center gap-2">
              <Input type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} aria-label={tr('Fra dato')} />
              <span className="text-muted">–</span>
              <Input type="date" value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} aria-label={tr('Til dato')} />
            </div>
          )}
        </fieldset>

        <Field label={tr('Prioritet')}>
          <Select value={f.priority} onChange={(e) => set({ priority: Number(e.target.value) })}>
            <option value={PRIORITY.normal}>{tr('Vanlig')}</option>
            <option value={PRIORITY.high}>{tr('Høy – overstyrer andre regler')}</option>
          </Select>
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          {tr('Regelen er aktiv')}
        </label>

        <ErrorText>{error}</ErrorText>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="submit" disabled={busy}>
            {busy ? tr('Lagrer …') : tr('Lagre')}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {tr('Avbryt')}
          </Button>
          {initial.id && (
            <Button type="button" variant="danger" onClick={onDelete} className="ml-auto">
              {tr('Slett regel')}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

/* ------------------------------- overstyring ------------------------------ */

function OverrideDialog({ playlists, tz, onSave, onClose }) {
  const [target, setTarget] = useState(String(playlists[0]?.id || 'off'));
  const [minutes, setMinutes] = useState(60);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const now = localParts(new Date(), tz);
    const body = {
      title: tr('Overstyring'),
      kind: target === 'off' ? 'off' : 'playlist',
      playlist_id: target === 'off' ? null : Number(target),
      priority: PRIORITY.high,
      start_date: now.date,
      end_date: now.date
    };
    if (minutes > 0) {
      // Slutt ved midnatt hvis varigheten går forbi den («00:00» = midnatt).
      const end = now.min + minutes;
      body.start_time = fromMin(now.min);
      body.end_time = end >= 1440 ? '00:00' : fromMin(end);
    } else if (minutes === -1) {
      body.start_time = fromMin(now.min);
      body.end_time = '00:00';
    } else {
      // «Til jeg stopper»: ingen slutt.
      delete body.start_date;
      delete body.end_date;
      body.title = 'Overstyring (til stoppet)';
    }
    try {
      await onSave(body);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={tr('Overstyr nå')}
        className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-line bg-card p-6 shadow-pop"
      >
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold text-ink">{tr('Overstyr nå')}</h2>
          <IconButton name="x" label={tr('Lukk')} onClick={onClose} />
        </div>
        <p className="m-0 text-sm text-muted">{tr('Skjermen viser dette med en gang, uansett tidsplan.')}</p>
        <Field label={tr('Vis')}>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="off">{tr('Skjerm av (svart)')}</option>
          </Select>
        </Field>
        <Field label={tr('Hvor lenge')}>
          <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            <option value={30}>{tr('30 minutter')}</option>
            <option value={60}>{tr('1 time')}</option>
            <option value={120}>{tr('2 timer')}</option>
            <option value={240}>{tr('4 timer')}</option>
            <option value={-1}>{tr('Resten av dagen')}</option>
            <option value={0}>{tr('Til jeg stopper')}</option>
          </Select>
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="submit">{tr('Overstyr')}</Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {tr('Avbryt')}
          </Button>
        </div>
      </form>
    </div>
  );
}

/* --------------------------------- kalender -------------------------------- */

function WeekCalendar({ dates, slots, today, nowMin, onNew, onEdit }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 6 * HOUR_PX;
  }, []);
  const blocks = useMemo(() => weekBlocks(slots, dates), [slots, dates]);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-line bg-zone text-xs">
        <div />
        {dates.map((d, i) => (
          <div
            key={d}
            className={`px-2 py-2 text-center font-semibold ${d === today ? 'text-brand' : 'text-muted'}`}
          >
            {DAY_LABELS[i]} {fmtDate(d, { day: 'numeric', month: 'numeric' })}
          </div>
        ))}
      </div>
      <div ref={scrollRef} className="max-h-[560px] overflow-y-auto">
        <div className="relative grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height: 24 * HOUR_PX }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted" style={{ top: h * HOUR_PX }}>
                {h > 0 ? `${String(h).padStart(2, '0')}:00` : ''}
              </div>
            ))}
          </div>
          {dates.map((d, di) => (
            <div key={d} className={`relative border-l border-hair ${d === today ? 'bg-brand-tint/40' : ''}`}>
              {Array.from({ length: 24 }, (_, h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={tr('Ny regel {0} kl. {1}', [DAY_LABELS[di], h])}
                  onClick={() => onNew(di + 1, h)}
                  className="absolute left-0 right-0 border-t border-hair hover:bg-zone"
                  style={{ top: h * HOUR_PX, height: HOUR_PX }}
                />
              ))}
              {blocks
                .filter((b) => b.date === d)
                .map((b, i) => (
                  <button
                    key={`${b.slot.id}-${i}`}
                    type="button"
                    onClick={() => onEdit(b.slot)}
                    title={`${b.slot.title || b.slot.playlist_name || 'Skjerm av'} · ${describeSlot(b.slot)}`}
                    className={`absolute left-1 right-1 overflow-hidden rounded-lg px-2 py-1 text-left text-[11px] leading-tight text-white shadow-card ${
                      Number(b.slot.priority) >= PRIORITY.high ? 'ring-2 ring-warn' : ''
                    }`}
                    style={{
                      top: (b.start / 60) * HOUR_PX + 1,
                      height: Math.max(18, ((b.end - b.start) / 60) * HOUR_PX - 2),
                      background: colorFor(b.slot),
                      zIndex: 1 + (Number(b.slot.priority) || 0)
                    }}
                  >
                    <span className="block truncate font-semibold">
                      {b.slot.kind === 'off' ? tr('Skjerm av') : b.slot.playlist_name}
                    </span>
                    {!b.tail && b.end - b.start >= 60 && (
                      <span className="block truncate opacity-80">
                        {fromMin(b.start)}–{fromMin(windowOf(b.slot)[1] % 1440 || 1440).replace('24:00', '00:00')}
                        {b.slot.title ? ` · ${b.slot.title}` : ''}
                      </span>
                    )}
                  </button>
                ))}
              {d === today && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-danger"
                  style={{ top: (nowMin / 60) * HOUR_PX }}
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------- side ---------------------------------- */

export default function TimetableManager() {
  const [screens, setScreens] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [screenId, setScreenId] = useState(null);
  const [slots, setSlots] = useState([]);
  const [tz, setTz] = useState('Europe/Oslo');
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState(null);
  const [overriding, setOverriding] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.screens.list(), api.playlists.list()])
      .then(([s, p]) => {
        setScreens(s || []);
        setPlaylists(p || []);
        // ?screen=<id> (fra skjermens detaljer) velger den skjermen.
        const wanted = Number(new URLSearchParams(window.location.search).get('screen'));
        setScreenId((cur) => cur ?? (s?.some((x) => x.id === wanted) ? wanted : s?.[0]?.id ?? null));
      })
      .catch((e) => setError(e.message));
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const loadSlots = () =>
    screenId &&
    api.timeslots
      .list(screenId)
      .then((r) => {
        setSlots(r.slots || []);
        setTz(r.timezone || 'Europe/Oslo');
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadSlots();
  }, [screenId]);

  const screen = screens?.find((s) => s.id === screenId) || null;
  const local = useMemo(() => localParts(new Date(), tz), [tz, tick]);
  const monday = addDays(local.date, 1 - local.dow + weekOffset * 7);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const current = useMemo(() => activeSlot(slots, new Date(), tz), [slots, tz, tick]);
  const defaultName = playlists.find((p) => p.id === screen?.playlist_id)?.name;
  const nowLabel = current
    ? current.kind === 'off'
      ? 'Skjerm av'
      : current.playlist_name
    : defaultName || 'Ingenting (ingen standardpresentasjon)';

  const save = async (body) => {
    if (editing?.id) await api.timeslots.update(editing.id, body);
    else await api.timeslots.create({ ...body, screen_id: screenId });
    setEditing(null);
    await loadSlots();
  };
  const remove = async () => {
    if (!confirm(tr('Slette regelen?'))) return;
    await api.timeslots.remove(editing.id);
    setEditing(null);
    await loadSlots();
  };
  const stopOverride = async (slot) => {
    await api.timeslots.remove(slot.id);
    await loadSlots();
  };
  const changeTz = async (value) => {
    try {
      const r = await api.settings.update({ timezone: value });
      setTz(r.timezone);
    } catch (e) {
      setError(e.message);
    }
  };

  const newAt = (dow, hour) =>
    setEditing({
      days: String(dow),
      start_time: fromMin(hour * 60),
      end_time: fromMin(Math.min(hour + 1, 24) * 60 === 1440 ? 0 : (hour + 1) * 60),
      playlist_id: playlists[0]?.id
    });

  if (screens && screens.length === 0) {
    return (
      <>
        <PageHeader title={tr('Tidsplan')} />
        <div className="mx-auto w-full max-w-6xl px-6 pb-12 pt-4 sm:px-8">
          <p className="rounded-2xl border border-dashed border-line bg-card px-6 py-10 text-center text-muted">
            {tr('Lag en skjerm først – så kan du bestemme hva den skal vise når.')}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={tr('Tidsplan')}
        subtitle={tr('Bestem hva hver skjerm viser når. Utenom reglene vises skjermens standardpresentasjon.')}
        action={
          <>
            <Button variant="outline" onClick={() => setOverriding(true)} disabled={!screen}>
              <Icon name="megaphone" className="h-4 w-4" />
              {tr('Overstyr nå')}
            </Button>
            <Button onClick={() => setEditing({ playlist_id: playlists[0]?.id })} disabled={!screen}>
              <Icon name="plus" className="h-4 w-4" />
              {tr('Ny regel')}
            </Button>
          </>
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-5 px-6 pb-12 pt-4 sm:px-8">
        <ErrorText>{error}</ErrorText>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label={tr('Skjerm')}>
          {(screens || []).map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === screenId}
              onClick={() => setScreenId(s.id)}
              className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${
                s.id === screenId ? 'bg-ink text-paper' : 'border border-line bg-card text-muted hover:text-ink'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {screen && (
          <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-card p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                  current?.kind === 'off' ? 'bg-zone text-muted' : 'bg-brand-tint text-brand'
                }`}
              >
                <Icon name={current?.kind === 'off' ? 'x' : 'play'} className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs text-muted">{tr('Viser nå')}</div>
                <div className="truncate font-bold text-ink">
                  {nowLabel}
                  <span className="font-normal text-muted">
                    {current ? ` · ${current.title || 'tidsplan'}` : tr(' · standard')}
                  </span>
                </div>
              </div>
              {current && Number(current.priority) >= PRIORITY.high && (
                <Button variant="outline" size="sm" onClick={() => stopOverride(current)}>
                  {tr('Avslutt overstyring')}
                </Button>
              )}
            </div>
            <div className="min-w-0 text-sm text-muted">
              {tr('Standard:')} <span className="font-semibold text-ink">{defaultName || 'ingen'}</span>
            </div>
            <label className="ml-auto flex items-center gap-2 text-sm text-muted">
              {tr('Tidssone')}
              <Select value={tz} onChange={(e) => changeTz(e.target.value)} className="!w-48">
                {[...new Set([tz, ...TIMEZONES])].map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </label>
          </section>
        )}

        <div className="flex items-center gap-2">
          <IconButton name="back" label={tr('Forrige uke')} onClick={() => setWeekOffset((w) => w - 1)} />
          <IconButton name="chevron" label={tr('Neste uke')} onClick={() => setWeekOffset((w) => w + 1)} />
          <span className="text-sm font-semibold text-ink">
            {tr('Uke')} {isoWeek(monday)} · {fmtDate(dates[0], { day: 'numeric', month: 'short' })} –{' '}
            {fmtDate(dates[6], { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          {weekOffset !== 0 && (
            <button type="button" onClick={() => setWeekOffset(0)} className="text-sm font-semibold text-brand hover:underline">
              {tr('I dag')}
            </button>
          )}
        </div>

        <WeekCalendar
          dates={dates}
          slots={slots}
          today={local.date}
          nowMin={local.min}
          onNew={newAt}
          onEdit={(slot) => setEditing(slot)}
        />

        <section className="space-y-2">
          <h2 className="m-0 text-base font-bold text-ink">{tr('Regler for')} {screen?.name}</h2>
          {slots.length === 0 ? (
            <p className="m-0 text-sm text-muted">
              {tr('Ingen regler – skjermen viser alltid standardpresentasjonen. Klikk i kalenderen for å lage en.')}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {slots.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-hair bg-card px-4 py-3">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colorFor(s) }} aria-hidden="true" />
                  <div className={`min-w-0 flex-1 ${s.enabled ? '' : 'opacity-50'}`}>
                    <div className="truncate font-semibold text-ink">
                      {s.kind === 'off' ? tr('Skjerm av') : s.playlist_name}
                      {s.title && <span className="font-normal text-muted"> · {s.title}</span>}
                      {Number(s.priority) >= PRIORITY.high && (
                        <span className="ml-2 rounded-full bg-warn-tint px-2 py-0.5 text-xs font-semibold text-warn">{tr('Høy')}</span>
                      )}
                      {!s.enabled && <span className="ml-2 text-xs text-muted">{tr('(av)')}</span>}
                    </div>
                    <div className="truncate text-sm text-muted">{describeSlot(s)}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                    {tr('Endre')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing && (
        <RuleEditor
          initial={editing}
          playlists={playlists}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
      {overriding && (
        <OverrideDialog
          playlists={playlists}
          tz={tz}
          onClose={() => setOverriding(false)}
          onSave={async (body) => {
            await api.timeslots.create({ ...body, screen_id: screenId });
            setOverriding(false);
            await loadSlots();
          }}
        />
      )}
    </>
  );
}
