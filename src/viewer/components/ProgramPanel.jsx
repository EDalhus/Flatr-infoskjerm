import { formatTime } from '../../lib/time.js';

const STATUS_STYLES = {
  live: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  scheduled: 'bg-slate-700/60 text-slate-300 border-slate-600',
  done: 'bg-slate-800 text-slate-500 border-slate-700',
  cancelled: 'bg-red-500/15 text-red-300 border-red-400/40'
};

const STATUS_LABEL = {
  live: 'Pågår',
  scheduled: 'Planlagt',
  done: 'Ferdig',
  cancelled: 'Avlyst'
};

export default function ProgramPanel({ items, nowItemId }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900/40">
      <h2 className="shrink-0 border-b border-slate-800 px-6 py-4 text-xl font-bold uppercase tracking-wide text-slate-300">
        Program
      </h2>

      <ol className="flex-1 divide-y divide-slate-800 overflow-y-auto">
        {items.length === 0 && (
          <li className="p-6 text-slate-500">Ingen programposter lagt inn ennå.</li>
        )}

        {items.map((item) => {
          const isNow = item.id === nowItemId;
          const dimmed = item.status === 'done' || item.status === 'cancelled';
          return (
            <li
              key={item.id}
              className={`flex items-start gap-5 px-6 py-4 ${
                isNow ? 'bg-emerald-500/10' : ''
              } ${dimmed ? 'opacity-45' : ''}`}
            >
              <div className="w-20 shrink-0 pt-1 font-mono text-lg font-semibold tabular-nums text-slate-200">
                {formatTime(item.start_time)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl font-bold text-slate-50">{item.title}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                      STATUS_STYLES[item.status] || STATUS_STYLES.scheduled
                    }`}
                  >
                    {STATUS_LABEL[item.status] || item.status}
                  </span>
                </div>
                {item.stage && (
                  <div className="mt-0.5 text-sm text-slate-400">{item.stage}</div>
                )}
                {item.description && (
                  <p className="mt-1 line-clamp-2 text-base text-slate-400">
                    {item.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
