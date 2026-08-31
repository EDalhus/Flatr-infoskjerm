import { useState } from 'react';
import { WEEKDAYS, hasDaypart } from '../../lib/daypart.js';
import { Icon, Input } from './ui.jsx';

/** «Vises når» – tidsstyring. `value` = { active_from, active_to, active_days, active_from_date, active_to_date } */
export default function DaypartFields({ value, onChange }) {
  const dp = value || {};
  const [open, setOpen] = useState(hasDaypart(dp));
  const set = (patch) => onChange({ ...dp, ...patch });
  const days = String(dp.active_days || '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter(Boolean);
  const toggleDay = (n) =>
    set({ active_days: (days.includes(n) ? days.filter((d) => d !== n) : [...days, n].sort()).join(',') });

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted"
      >
        <Icon name={open ? 'down' : 'chevron'} className="h-3.5 w-3.5" />
        Vises når
        {hasDaypart(dp) && (
          <span className="rounded-full bg-brand-tint px-1.5 text-[10px] text-brand">aktiv</span>
        )}
      </button>
      {open && (
        <div className="mt-2 grid gap-3 rounded-lg border border-hair bg-card p-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            Fra klokkeslett
            <Input type="time" value={dp.active_from || ''} onChange={(e) => set({ active_from: e.target.value })} />
          </label>
          <label className="text-xs text-muted">
            Til klokkeslett
            <Input type="time" value={dp.active_to || ''} onChange={(e) => set({ active_to: e.target.value })} />
          </label>
          <div className="sm:col-span-2">
            <div className="mb-1 text-xs text-muted">Ukedager (ingen valgt = alle)</div>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.n}
                  type="button"
                  onClick={() => toggleDay(d.n)}
                  className={`h-8 w-9 rounded-lg border text-xs font-bold ${
                    days.includes(d.n) ? 'border-brand bg-brand text-white' : 'border-line bg-card text-muted'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <label className="text-xs text-muted">
            Fra dato
            <Input type="date" value={dp.active_from_date || ''} onChange={(e) => set({ active_from_date: e.target.value })} />
          </label>
          <label className="text-xs text-muted">
            Til dato
            <Input type="date" value={dp.active_to_date || ''} onChange={(e) => set({ active_to_date: e.target.value })} />
          </label>
        </div>
      )}
    </div>
  );
}
