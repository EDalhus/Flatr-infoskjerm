import { useEffect, useState } from 'react';
import { Icon, Button } from '../ui.jsx';

// Felles byggeklosser for innstillingssidene til Flatr Apps.

/** Seksjon med tittel, valgfri undertekst og handling til høyre. */
export function Section({ icon, title, count, hint, action, children, flush = false }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-hair bg-card">
      <header className="flex items-center gap-3 px-5 pb-3 pt-4">
        {icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zone text-muted">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="m-0 flex items-center gap-2 text-sm font-semibold text-ink">
            {title}
            {count != null && <span className="rounded-full bg-zone px-2 py-0.5 text-[11px] font-medium text-muted">{count}</span>}
          </h3>
          {hint && <p className="m-0 mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {action}
      </header>
      <div className={flush ? '' : 'px-5 pb-5'}>{children}</div>
    </section>
  );
}

/**
 * Lagre-linje som flyter nederst når noe er endret («Ulagrede endringer ·
 * Forkast · Lagre»), og viser «Lagret» et øyeblikk etterpå.
 */
export function SaveBar({ dirty, busy, error, onSave, onDiscard }) {
  const [saved, setSaved] = useState(false);
  const [wasBusy, setWasBusy] = useState(false);

  useEffect(() => {
    if (busy) setWasBusy(true);
    else if (wasBusy) {
      setWasBusy(false);
      if (!error && !dirty) {
        setSaved(true);
        const t = setTimeout(() => setSaved(false), 2200);
        return () => clearTimeout(t);
      }
    }
    return undefined;
  }, [busy, error, dirty, wasBusy]);

  // Ctrl/⌘+S lagrer.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && dirty && !busy) {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, busy, onSave]);

  const show = dirty || busy || saved || !!error;
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 transition-all duration-200 ${
        show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-2.5 shadow-pop">
        {saved && !dirty ? (
          <span className="flex items-center gap-2 text-sm font-medium text-brand">
            <Icon name="check" className="h-4 w-4" /> Lagret
          </span>
        ) : (
          <>
            <span className={`text-sm ${error ? 'text-danger' : 'text-ink'}`}>{error || 'Ulagrede endringer'}</span>
            {onDiscard && (
              <Button variant="ghost" size="sm" onClick={onDiscard} disabled={busy}>
                Forkast
              </Button>
            )}
            <Button size="sm" onClick={onSave} disabled={busy || !dirty}>
              {busy ? 'Lagrer …' : 'Lagre'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Statusprikk: grønn (i fart/ok), gul (stille), grå (ingen data), rød (feil). */
export function Dot({ tone = 'muted', title }) {
  const color = { ok: 'bg-emerald-400', warn: 'bg-amber-400', muted: 'bg-slate-500', bad: 'bg-red-500' }[tone];
  return <span title={title} className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}
