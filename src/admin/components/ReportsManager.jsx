// Rapporter – visningslogg: hvor lenge hver presentasjon, kanal og enhet har
// vært på skjerm. Fylles hvert minutt av serveren for skjermer som er online.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { addDays, localParts } from '../../lib/timeslots.js';
import { Icon, Input, Button, PageHeader, ErrorText } from './ui.jsx';

const PRESETS = [
  { id: 'today', label: 'I dag', days: 1 },
  { id: '7', label: '7 dager', days: 7 },
  { id: '30', label: '30 dager', days: 30 }
];

function fmtMinutes(min) {
  const m = Math.round(Number(min) || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} t ${m % 60} min` : `${h} t`;
}

const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('nb-NO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' });

function BarList({ title, rows, total }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
      <h2 className="m-0 text-base font-bold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="m-0 text-sm text-muted">Ingen data i perioden.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {rows.map((r) => {
            const pct = total ? Math.round((r.minutes / total) * 100) : 0;
            return (
              <li key={r.key} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">{fmtMinutes(r.minutes)}</span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-xs text-muted">{pct} %</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zone" aria-hidden="true">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(pct, 1)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const fmtSeconds = (sec) => (sec < 90 ? `${Math.round(sec)} s` : fmtMinutes(sec / 60));

/** Visninger skjermene selv har meldt: hvor mange ganger, hvor lenge og på hvor mange skjermer. */
function PlaysTable({ title, hint, rows, empty }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
      <div>
        <h2 className="m-0 text-base font-bold text-ink">{title}</h2>
        {hint && <p className="m-0 mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="m-0 text-sm text-muted">{empty}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-semibold">Navn</th>
              <th className="w-24 pb-2 text-right font-semibold">Visninger</th>
              <th className="w-24 pb-2 text-right font-semibold">Tid</th>
              <th className="w-20 pb-2 text-right font-semibold">Skjermer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-hair">
                <td className="max-w-0 py-2 pr-2">
                  <span className="block truncate font-medium text-ink">{r.name}</span>
                  {r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}
                </td>
                <td className="py-2 text-right tabular-nums text-ink">{r.shows.toLocaleString('nb-NO')}</td>
                <td className="py-2 text-right tabular-nums text-muted">{fmtSeconds(r.seconds)}</td>
                <td className="py-2 text-right tabular-nums text-muted">{r.screens}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function downloadCsv(report) {
  const rows = [['Type', 'Navn', 'Minutter']];
  for (const p of report.playlists) rows.push(['Presentasjon', p.name, p.minutes]);
  for (const s of report.screens) rows.push(['Skjerm', s.name, s.minutes]);
  for (const d of report.days) rows.push(['Dag', d.day, d.minutes]);
  rows.push([], ['Type', 'Navn', 'Visninger', 'Sekunder', 'Skjermer']);
  for (const s of report.sponsors || []) rows.push(['Sponsor', s.name, s.shows, s.seconds, s.screens]);
  for (const s of report.slides || []) rows.push(['Lysbilde', `${s.playlist ? `${s.playlist} – ` : ''}${s.name}`, s.shows, s.seconds, s.screens]);
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `flatr-visningslogg-${report.from}-${report.to}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function ReportsManager() {
  const today = localParts(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone).date;
  const [range, setRange] = useState({ preset: '7', from: addDays(today, -6), to: today });
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api
      .reports(range.from, range.to)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [range.from, range.to]);

  const pick = (p) => setRange({ preset: p.id, from: addDays(today, -(p.days - 1)), to: today });
  const maxDay = useMemo(() => Math.max(1, ...(report?.days || []).map((d) => d.minutes)), [report]);

  const total = report?.total_minutes || 0;
  const days = useMemo(() => {
    if (!report) return [];
    const by = Object.fromEntries(report.days.map((d) => [d.day, d.minutes]));
    const out = [];
    for (let d = report.from; d <= report.to && out.length < 62; d = addDays(d, 1)) out.push({ day: d, minutes: by[d] || 0 });
    return out;
  }, [report]);

  return (
    <>
      <PageHeader
        title="Rapporter"
        subtitle="Hvor lenge innholdet har vært på skjerm. Basert på hva hver tilkoblede skjerm er satt til å vise, minutt for minutt."
        action={
          report && (
            <Button variant="outline" onClick={() => downloadCsv(report)} disabled={!total && !report.slides?.length}>
              <Icon name="down" className="h-4 w-4" />
              Last ned CSV
            </Button>
          )
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-5 px-6 pb-12 pt-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              aria-pressed={range.preset === p.id}
              className={`h-9 rounded-full px-4 text-sm font-semibold ${
                range.preset === p.id ? 'bg-ink text-paper' : 'border border-line bg-card text-muted hover:text-ink'
              }`}
            >
              {p.label}
            </button>
          ))}
          <span className="ml-2 flex items-center gap-2 text-sm text-muted">
            <Input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, preset: null, from: e.target.value }))}
              aria-label="Fra dato"
              className="!w-40"
            />
            –
            <Input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, preset: null, to: e.target.value }))}
              aria-label="Til dato"
              className="!w-40"
            />
          </span>
        </div>

        <ErrorText>{error}</ErrorText>

        {report && (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-1 rounded-2xl bg-brand p-5 text-onbrand">
                <span className="text-sm font-semibold opacity-90">Total skjermtid</span>
                <span className="text-[2rem] font-extrabold leading-tight tabular-nums">{fmtMinutes(total)}</span>
                <span className="text-sm opacity-90">på tvers av alle skjermer</span>
              </div>
              <div className="flex flex-col gap-1 rounded-2xl border border-line bg-card p-5">
                <span className="text-sm font-semibold text-muted">Aktive skjermer</span>
                <span className="text-[2rem] font-extrabold leading-tight tabular-nums text-ink">{report.screens.length}</span>
                <span className="text-sm text-muted">var online i perioden</span>
              </div>
              <div className="flex flex-col gap-1 rounded-2xl border border-line bg-card p-5">
                <span className="text-sm font-semibold text-muted">Mest vist</span>
                <span className="truncate text-[2rem] font-extrabold leading-tight text-ink">
                  {report.playlists[0]?.name || '–'}
                </span>
                <span className="text-sm text-muted">{report.playlists[0] ? fmtMinutes(report.playlists[0].minutes) : 'Ingen data ennå'}</span>
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="m-0 mb-4 text-base font-bold text-ink">Skjermtid pr. dag</h2>
              <div className="flex h-40 items-end gap-1" role="img" aria-label="Skjermtid pr. dag">
                {days.map((d) => (
                  <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${fmtDay(d.day)}: ${fmtMinutes(d.minutes)}`}>
                    <div
                      className="w-full rounded-t-md bg-brand"
                      style={{ height: `${Math.max(2, (d.minutes / maxDay) * 128)}px`, opacity: d.minutes ? 1 : 0.2 }}
                    />
                    {days.length <= 14 && <span className="truncate text-[11px] text-muted">{fmtDay(d.day)}</span>}
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <BarList
                title="Presentasjoner"
                total={total}
                rows={report.playlists.map((p) => ({ key: `${p.playlist_id}-${p.name}`, name: p.name, minutes: p.minutes }))}
              />
              <BarList title="Skjermer" total={total} rows={report.screens.map((s) => ({ key: s.screen_id, name: s.name, minutes: s.minutes }))} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PlaysTable
                title="Sponsorer"
                hint="Hvor mange ganger hver sponsor faktisk ble vist."
                empty="Ingen sponsorvisninger i perioden."
                rows={(report.sponsors || []).map((s) => ({ key: s.sponsor_id, name: s.name, shows: s.shows, seconds: s.seconds, screens: s.screens }))}
              />
              <PlaysTable
                title="Lysbilder"
                hint="Hvor mange ganger hvert lysbilde faktisk ble vist."
                empty="Ingen lysbildevisninger i perioden."
                rows={(report.slides || []).slice(0, 50).map((s) => ({ key: `${s.playlist_id}-${s.slide_id}`, name: s.name, sub: s.playlist, shows: s.shows, seconds: s.seconds, screens: s.screens }))}
              />
            </div>

            <p className="m-0 text-xs text-muted">
              Tidssone: {report.timezone}. Skjermtiden telles av serveren hvert minutt for Apple TV-er som er online.
              Visninger av lysbilder og sponsorer meldes av skjermene selv (Apple TV med ny app og nettleser), og kan
              komme inn noen minutter etter at de ble vist.
            </p>
          </>
        )}
      </div>
    </>
  );
}
