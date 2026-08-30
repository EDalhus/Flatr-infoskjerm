import { formatTime } from '../../lib/time.js';

/** Viser aktive meldinger som en liste (utfyller pop-up-varselet). */
export default function MessageBoard({ alerts }) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
        Meldinger
      </div>
      <ul className="mt-2 space-y-2">
        {alerts.slice(0, 4).map((a) => (
          <li key={a.id} className="text-lg leading-snug text-amber-50">
            <span className="mr-2 font-mono text-sm text-amber-300/80">
              {formatTime(a.created_at)}
            </span>
            {a.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
