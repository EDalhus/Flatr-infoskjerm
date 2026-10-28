import { useEffect, useState } from 'react';
import { WEEKDAYS, cleanHours, defaultHours, summarize } from '../../lib/hours.js';

// Åpningstider for en skjerm: av/på, og fra–til per ukedag. Utenfor åpningstid
// er skjermen svart. Lagrer når en dag slås av/på og når et klokkeslett er
// ferdig utfylt (blur), ikke for hvert tastetrykk.

export default function HoursEditor({ value, onSave }) {
  const [h, setH] = useState(() => cleanHours(value) || { ...defaultHours(), enabled: false });
  useEffect(() => {
    setH(cleanHours(value) || { ...defaultHours(), enabled: false });
  }, [JSON.stringify(value)]);

  const commit = (next) => {
    setH(next);
    onSave(next);
  };
  const setDay = (d, v, save) => {
    const next = { ...h, days: { ...h.days, [d]: v } };
    if (save) commit(next);
    else setH(next);
  };
  const copyWeekdays = () => {
    const mon = h.days[1];
    if (!mon) return;
    commit({ ...h, days: { ...h.days, 2: { ...mon }, 3: { ...mon }, 4: { ...mon }, 5: { ...mon } } });
  };

  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={h.enabled}
          onChange={(e) => commit({ ...h, enabled: e.target.checked })}
          className="h-4 w-4 rounded border-line text-brand"
        />
        Slå av skjermen utenfor åpningstid
      </label>
      {h.enabled && (
        <>
          <div className="grid gap-1.5">
            {WEEKDAYS.map(([d, name]) => {
              const v = h.days[d];
              return (
                <div key={d} className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 text-sm">
                  <label className="flex items-center gap-2 text-ink">
                    <input
                      type="checkbox"
                      checked={!!v}
                      onChange={(e) => setDay(d, e.target.checked ? { open: '07:00', close: '17:00' } : null, true)}
                      className="h-4 w-4 rounded border-line text-brand"
                    />
                    {name}
                  </label>
                  {v ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="time"
                        value={v.open}
                        onChange={(e) => setDay(d, { ...v, open: e.target.value })}
                        onBlur={() => onSave(h)}
                        className="h-8 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
                        aria-label={`${name} åpner`}
                      />
                      <span className="text-muted">–</span>
                      <input
                        type="time"
                        value={v.close}
                        onChange={(e) => setDay(d, { ...v, close: e.target.value })}
                        onBlur={() => onSave(h)}
                        className="h-8 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
                        aria-label={`${name} stenger`}
                      />
                    </div>
                  ) : (
                    <span className="text-muted">Av hele dagen</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{summarize(h)}</span>
            {h.days[1] && (
              <button type="button" onClick={copyWeekdays} className="font-semibold text-brand hover:underline">
                Bruk mandag på alle hverdager
              </button>
            )}
          </div>
          <p className="m-0 text-xs text-muted">
            Tidsplanen går foran: et arrangement lagt inn i Tidsplan vises selv om det er utenfor åpningstid. Apple TV-en slår seg av også uten nett.
          </p>
        </>
      )}
    </div>
  );
}
