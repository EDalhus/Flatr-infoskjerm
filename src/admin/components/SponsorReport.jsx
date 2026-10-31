// Sponsorrapport (Rapporter → Sponsorer og logoer → «Rapport»): hvor mange
// ganger og hvor lenge én logo eller sponsor ble vist, per skjerm og per dag.
// Laget for å sendes til sponsoren: «Skriv ut» lagrer den som PDF.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { addDays } from '../../lib/timeslots.js';
import { Button, Select, ErrorText, Icon } from './ui.jsx';

const pad = (n) => String(n).padStart(2, '0');
const monthStart = (y, m) => `${y}-${pad(m + 1)}-01`;
const monthEnd = (y, m) => addDays(monthStart(m === 11 ? y + 1 : y, (m + 1) % 12), -1);

function periods(today, current) {
  const [y, m] = today.split('-').map(Number);
  const prev = m === 1 ? [y - 1, 11] : [y, m - 2];
  return [
    { id: 'last-month', label: 'Forrige måned', from: monthStart(...prev), to: monthEnd(...prev) },
    { id: 'this-month', label: 'Denne måneden', from: monthStart(y, m - 1), to: today },
    { id: 'year', label: 'Hittil i år', from: `${y}-01-01`, to: today },
    { id: 'current', label: 'Samme periode som rapporten', from: current.from, to: current.to }
  ];
}

const fmtDate = (d, opts) => new Date(`${d}T12:00:00Z`).toLocaleDateString('nb-NO', { timeZone: 'UTC', ...opts });
const periodText = (from, to) =>
  from === to
    ? fmtDate(from, { day: 'numeric', month: 'long', year: 'numeric' })
    : from.slice(0, 7) === to.slice(0, 7) && from.endsWith('-01') && to === monthEnd(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1)
      ? fmtDate(from, { month: 'long', year: 'numeric' })
      : `${fmtDate(from, { day: 'numeric', month: 'long', year: 'numeric' })} – ${fmtDate(to, { day: 'numeric', month: 'long', year: 'numeric' })}`;

function duration(sec) {
  const min = Math.round(sec / 60);
  if (min < 1) return `${Math.round(sec)} sek`;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} t ${pad(min % 60)} min`;
}

export default function SponsorReport({ target, today, current, onClose }) {
  const options = useMemo(() => periods(today, current), [today, current]);
  const [period, setPeriod] = useState('last-month');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const p = options.find((o) => o.id === period) || options[0];

  useEffect(() => {
    setData(null);
    setError('');
    api
      .sponsorReport({ ...target, from: p.from, to: p.to })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [target.media, target.sponsor, p.from, p.to]);

  // Ved utskrift vises bare rapporten (se .print-report i index.css).
  useEffect(() => {
    document.body.classList.add('print-report');
    return () => document.body.classList.remove('print-report');
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const days = data?.days || [];
  const maxShows = Math.max(1, ...days.map((d) => d.shows));
  const dayCount = Math.max(1, Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86_400_000) + 1);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 print:static print:bg-white print:p-0" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-card p-3 shadow-pop print:hidden">
          <Select id="sponsor-period" value={period} onChange={(e) => setPeriod(e.target.value)} className="!w-56" aria-label="Periode">
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
          <span className="text-xs text-muted">Trykk «Skriv ut» og velg «Lagre som PDF» for å sende rapporten til sponsoren.</span>
          <span className="ml-auto flex gap-2">
            <Button onClick={() => window.print()} disabled={!data}>
              <Icon name="share" className="h-4 w-4" />
              Skriv ut
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Lukk
            </Button>
          </span>
        </div>
        <ErrorText>{error}</ErrorText>

        <article className="sponsor-report rounded-2xl bg-white p-10 text-[#16181d] shadow-pop print:rounded-none print:p-0 print:shadow-none">
          <header className="flex items-center justify-between gap-6 border-b border-[#e5e7eb] pb-6">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#027353]">Visningsrapport</div>
              <h1 className="m-0 mt-1 text-3xl font-extrabold leading-tight">{data?.name || '…'}</h1>
              <div className="mt-1 text-sm text-[#5b6170]">
                {periodText(p.from, p.to)}
                {data?.org ? ` · ${data.org}` : ''}
              </div>
            </div>
            {data?.image && <img src={data.image} alt="" className="h-20 max-w-[180px] shrink-0 object-contain" />}
          </header>

          {!data ? (
            <p className="py-16 text-center text-sm text-[#5b6170]">Henter tallene …</p>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-4 py-8 sm:grid-cols-4">
                {[
                  ['Visninger', data.shows.toLocaleString('nb-NO')],
                  ['Tid på skjerm', duration(data.seconds)],
                  ['Skjermer', data.screens.length],
                  ['Snitt per dag', Math.round(data.shows / dayCount).toLocaleString('nb-NO')]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-[#f4f6f5] p-4">
                    <div className="text-xs font-semibold text-[#5b6170]">{label}</div>
                    <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
                  </div>
                ))}
              </section>

              {days.length > 1 && (
                <section className="pb-8">
                  <h2 className="m-0 mb-3 text-sm font-bold">Visninger per dag</h2>
                  <div className="flex h-32 items-end gap-[2px] border-b border-[#e5e7eb]">
                    {days.map((d) => (
                      <div key={d.day} className="flex-1 rounded-t bg-[#027353]" style={{ height: `${Math.max(2, (d.shows / maxShows) * 100)}%` }} title={`${fmtDate(d.day, { day: 'numeric', month: 'short' })}: ${d.shows}`} />
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-[#5b6170]">
                    <span>{fmtDate(days[0].day, { day: 'numeric', month: 'short' })}</span>
                    <span>{fmtDate(days[days.length - 1].day, { day: 'numeric', month: 'short' })}</span>
                  </div>
                </section>
              )}

              <section>
                <h2 className="m-0 mb-2 text-sm font-bold">Per skjerm</h2>
                {data.screens.length === 0 ? (
                  <p className="m-0 text-sm text-[#5b6170]">Ingen visninger i perioden.</p>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-xs text-[#5b6170]">
                        <th className="pb-2 font-semibold">Skjerm</th>
                        <th className="pb-2 text-right font-semibold">Visninger</th>
                        <th className="pb-2 text-right font-semibold">Tid på skjerm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.screens.map((s) => (
                        <tr key={s.screen_id} className="border-t border-[#eef0ee]">
                          <td className="py-2">
                            <span className="font-medium">{s.name}</span>
                            {s.location && <span className="text-[#5b6170]"> · {s.location}</span>}
                          </td>
                          <td className="py-2 text-right tabular-nums">{s.shows.toLocaleString('nb-NO')}</td>
                          <td className="py-2 text-right tabular-nums">{duration(s.seconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <footer className="mt-10 flex items-center justify-between gap-4 border-t border-[#e5e7eb] pt-4 text-[11px] text-[#5b6170]">
                <span>Tallene er meldt av skjermene selv hver gang logoen var på skjermen.</span>
                <span className="shrink-0 font-semibold">Laget med Flatr · flatr.no</span>
              </footer>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
