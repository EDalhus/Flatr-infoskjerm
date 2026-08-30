import { formatDate } from '../../lib/time.js';

export default function Clock({ now }) {
  const time = now.toLocaleTimeString('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <div className="rounded-2xl border border-hair bg-card p-5 text-center shadow-card">
      <div className="font-mono text-5xl font-bold tabular-nums tracking-tight text-ink portrait:text-4xl">
        {time}
      </div>
      <div className="mt-1 text-sm uppercase tracking-widest text-muted">{formatDate(now)}</div>
    </div>
  );
}
