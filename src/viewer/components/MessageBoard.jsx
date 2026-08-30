import { formatTime } from '../../lib/time.js';

/** Viser aktive meldinger som en liste (utfyller pop-up-varselet). */
export default function MessageBoard({ alerts }) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-300/60 bg-amber-100/70 p-4">
      <div className="text-xs font-bold uppercase tracking-[0.25em] text-amber-700">Meldinger</div>
      <ul className="mt-2 space-y-2">
        {alerts.slice(0, 4).map((a) => (
          <li key={a.id} className="text-lg leading-snug text-amber-900">
            <span className="mr-2 font-mono text-sm text-amber-600">{formatTime(a.created_at)}</span>
            {a.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
