// Rapporter – visningslogg: hvor lenge hver spilleliste, kanal og enhet har
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

function downloadCsv(report) {
  const rows = [['Type', 'Navn', 'Minutter']];
  for (const p of report.playlists) rows.push(['Spilleliste', p.name, p.minutes]);
  for (const s of report.screens) rows.push(['Kanal', s.name, s.minutes]);
  for (const d of report.devices) rows.push(['Enhet', d.name, d.minutes]);
  for (const d of report.days) rows.push(['Dag', d.day, d.minutes]);
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
            <Button variant="outline" onClick={() => downloadCsv(report)} disabled={!total}>
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
                <span className="text-sm opacity-90">på tvers av alle enheter</span>
              </div>
              <div className="flex flex-col gap-1 rounded-2xl border border-line bg-card p-5">
                <span className="text-sm font-semibold text-muted">Aktive enheter</span>
                <span className="text-[2rem] font-extrabold leading-tight tabular-nums text-ink">{report.devices.length}</span>
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

            <div className="grid gap-4 lg:grid-cols-3">
              <BarList
                title="Spillelister"
                total={total}
                rows={report.playlists.map((p) => ({ key: `${p.playlist_id}-${p.name}`, name: p.name, minutes: p.minutes }))}
              />
              <BarList title="Kanaler" total={total} rows={report.screens.map((s) => ({ key: s.screen_id, name: s.name, minutes: s.minutes }))} />
              <BarList title="Enheter" total={total} rows={report.devices.map((d) => ({ key: d.device_id, name: d.name, minutes: d.minutes }))} />
            </div>

            <p className="m-0 text-xs text-muted">
              Tidssone: {report.timezone}. Loggen telles av serveren hvert minutt for Apple TV-er som er online. Nettleser-skjermer
              uten paring telles ikke.
            </p>
          </>
        )}
      </div>
    </>
  );
}
