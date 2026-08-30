import { formatDate } from '../../lib/time.js';

export default function ClockSlide({ slide, ctx }) {
  const cfg = slide.config || {};
  const now = ctx.now;
  const time = now.toLocaleTimeString('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
    ...(cfg.showSeconds !== false ? { second: '2-digit' } : {})
  });

  return (
    <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-hair bg-card p-6 text-center shadow-card">
      <div className="font-mono text-7xl font-bold tabular-nums tracking-tight text-ink portrait:text-5xl">
        {time}
      </div>
      {cfg.showDate !== false && (
        <div className="mt-2 text-lg uppercase tracking-[0.3em] text-muted">{formatDate(now)}</div>
      )}
    </div>
  );
}
