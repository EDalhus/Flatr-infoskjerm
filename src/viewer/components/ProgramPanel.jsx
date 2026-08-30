import { formatTime } from '../../lib/time.js';

const STATUS_STYLES = {
  live: 'bg-ok-tint text-ok border-ok/30',
  scheduled: 'bg-hair text-muted border-line',
  done: 'bg-hair text-muted/70 border-line',
  cancelled: 'bg-danger-tint text-danger border-danger/30'
};

const STATUS_LABEL = {
  live: 'Pågår',
  scheduled: 'Planlagt',
  done: 'Ferdig',
  cancelled: 'Avlyst'
};

export default function ProgramPanel({ items, nowItemId }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-hair bg-card shadow-card">
      <h2 className="shrink-0 bg-zone px-6 py-4 text-xl font-bold uppercase tracking-wide text-zoneink">
        Program
      </h2>

      <ol className="flex-1 divide-y divide-hair overflow-y-auto">
        {items.length === 0 && (
          <li className="p-6 text-muted">Ingen programposter lagt inn ennå.</li>
        )}

        {items.map((item) => {
          const isNow = item.id === nowItemId;
          const dimmed = item.status === 'done' || item.status === 'cancelled';
          return (
            <li
              key={item.id}
              className={`flex items-start gap-5 px-6 py-4 ${isNow ? 'bg-brand-tint/60' : ''} ${
                dimmed ? 'opacity-45' : ''
              }`}
            >
              <div className="w-20 shrink-0 pt-1 font-mono text-lg font-semibold tabular-nums text-ink">
                {formatTime(item.start_time)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl font-bold text-ink">{item.title}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                      STATUS_STYLES[item.status] || STATUS_STYLES.scheduled
                    }`}
                  >
                    {STATUS_LABEL[item.status] || item.status}
                  </span>
                </div>
                {item.stage && <div className="mt-0.5 text-sm text-muted">{item.stage}</div>}
                {item.description && (
                  <p className="mt-1 line-clamp-2 text-base text-muted">{item.description}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
