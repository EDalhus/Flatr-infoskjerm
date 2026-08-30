import { useEffect, useRef, useState } from 'react';

const VISIBLE_MS = 30_000;

/**
 * Full-skjerm pop-up når admin publiserer en hastemelding.
 * Hver melding vises én gang i VISIBLE_MS, og skjules straks den deaktiveres.
 */
export default function AlertOverlay({ alerts }) {
  const [active, setActive] = useState(null);
  const seen = useRef(new Set());

  useEffect(() => {
    const fresh = alerts.find((a) => !seen.current.has(a.id));
    if (!fresh) return undefined;
    seen.current.add(fresh.id);
    setActive(fresh);
    const id = setTimeout(() => setActive(null), VISIBLE_MS);
    return () => clearTimeout(id);
  }, [alerts]);

  useEffect(() => {
    if (active && !alerts.some((a) => a.id === active.id)) setActive(null);
  }, [alerts, active]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 p-12 backdrop-blur-sm">
      <div className="w-full max-w-5xl animate-alert-in rounded-[2rem] border-4 border-white/50 bg-danger p-14 text-center shadow-pop">
        <div className="text-2xl font-black uppercase tracking-[0.4em] text-white/85">
          Viktig beskjed
        </div>
        <div className="mt-6 text-6xl font-extrabold leading-tight text-white portrait:text-4xl">
          {active.message}
        </div>
      </div>
    </div>
  );
}
