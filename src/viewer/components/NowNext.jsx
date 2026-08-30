import { formatTime, minutesUntil } from '../../lib/time.js';

function Card({ label, item, now, accent }) {
  return (
    <div
      className={`flex-1 rounded-2xl border p-6 ${
        accent
          ? 'border-emerald-400/40 bg-emerald-500/10'
          : 'border-slate-700 bg-slate-800/50'
      }`}
    >
      <div
        className={`text-sm font-semibold uppercase tracking-[0.2em] ${
          accent ? 'text-emerald-300' : 'text-slate-400'
        }`}
      >
        {label}
      </div>

      {item ? (
        <>
          <div className="mt-2 text-3xl font-extrabold leading-tight portrait:text-2xl">
            {item.title}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-lg text-slate-300">
            <span className="font-semibold text-slate-100">
              {formatTime(item.start_time)}
              {item.end_time ? `–${formatTime(item.end_time)}` : ''}
            </span>
            {item.stage && <span className="text-slate-400">· {item.stage}</span>}
            {!accent && (
              <span className="text-slate-400">
                · om {Math.max(0, minutesUntil(item.start_time, now))} min
              </span>
            )}
          </div>
          {item.description && (
            <p className="mt-3 line-clamp-2 text-base text-slate-400">{item.description}</p>
          )}
        </>
      ) : (
        <div className="mt-3 text-xl text-slate-500">Ingenting planlagt</div>
      )}
    </div>
  );
}

export default function NowNext({ nowItem, nextItem, now }) {
  return (
    <div className="flex gap-4 portrait:flex-col">
      <Card label="Nå på scenen" item={nowItem} now={now} accent />
      <Card label="Neste ut" item={nextItem} now={now} />
    </div>
  );
}
