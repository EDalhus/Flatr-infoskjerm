import { formatTime, minutesUntil } from '../../lib/time.js';

function Card({ label, item, now, accent }) {
  return (
    <div
      className={`flex-1 rounded-2xl border p-6 shadow-card ${
        accent ? 'border-ok/40 bg-ok-tint' : 'border-hair bg-card'
      }`}
    >
      <div
        className={`text-sm font-bold uppercase tracking-[0.2em] ${
          accent ? 'text-ok' : 'text-muted'
        }`}
      >
        {label}
      </div>

      {item ? (
        <>
          <div className="mt-2 text-3xl font-extrabold leading-tight text-ink portrait:text-2xl">
            {item.title}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-lg text-muted">
            <span className="font-semibold text-ink">
              {formatTime(item.start_time)}
              {item.end_time ? `–${formatTime(item.end_time)}` : ''}
            </span>
            {item.stage && <span>· {item.stage}</span>}
            {!accent && <span>· om {Math.max(0, minutesUntil(item.start_time, now))} min</span>}
          </div>
          {item.description && (
            <p className="mt-3 line-clamp-2 text-base text-muted">{item.description}</p>
          )}
        </>
      ) : (
        <div className="mt-3 text-xl text-muted">Ingenting planlagt</div>
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
