import { formatDate } from '../../lib/time.js';

export default function ClockSlide({ slide, ctx, chromeless }) {
  const cfg = slide.config || {};
  const bare = chromeless || cfg.frame === false;
  const now = ctx.now;
  const time = now.toLocaleTimeString('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
    ...(cfg.showSeconds !== false ? { second: '2-digit' } : {})
  });

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center text-center ${
        bare ? '' : 'rounded-xl border border-hair bg-card p-4 text-ink shadow-card'
      }`}
      style={{ containerType: 'size' }}
    >
      <div className="font-mono font-bold tabular-nums" style={{ fontSize: '30cqmin', lineHeight: 1 }}>
        {time}
      </div>
      {cfg.showDate !== false && (
        <div
          className="mt-[4%] uppercase tracking-[0.2em] opacity-70"
          style={{ fontSize: '7cqmin' }}
        >
          {formatDate(now)}
        </div>
      )}
    </div>
  );
}
