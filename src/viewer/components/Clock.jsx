import { formatDate } from '../../lib/time.js';

export default function Clock({ now }) {
  const time = now.toLocaleTimeString('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <div className="rounded-2xl bg-slate-800/60 p-5 text-center">
      <div className="font-mono text-5xl font-bold tabular-nums tracking-tight portrait:text-4xl">
        {time}
      </div>
      <div className="mt-1 text-sm uppercase tracking-widest text-slate-400">
        {formatDate(now)}
      </div>
    </div>
  );
}
