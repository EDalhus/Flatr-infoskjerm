import { partitionSchedule } from '../../lib/time.js';

const TONES = {
  none: '',
  info: 'bg-brand text-white',
  success: 'bg-ok text-white',
  warn: 'bg-danger text-white'
};

const pad = (n) => String(n).padStart(2, '0');

export default function CountdownSlide({ slide, ctx }) {
  const cfg = slide.config || {};
  const tone = TONES[cfg.emphasis] ?? TONES.info;

  let target = cfg.target;
  if (cfg.mode === 'nextItem') {
    const { nextItem } = partitionSchedule(ctx.schedule || [], ctx.now);
    target = nextItem?.start_time;
  }

  const ms = target ? new Date(target).getTime() - ctx.now.getTime() : NaN;
  const done = Number.isNaN(ms) ? false : ms <= 0;

  let text = '--:--:--';
  if (!Number.isNaN(ms) && ms > 0) {
    const total = Math.floor(ms / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    text = d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-[3%] rounded-xl p-[4%] text-center ${tone}`}
      style={{ containerType: 'size' }}
    >
      {(cfg.title || slide.title) && (
        <div
          className="font-black uppercase tracking-[0.25em] opacity-85"
          style={{ fontSize: '7cqmin' }}
        >
          {cfg.title || slide.title}
        </div>
      )}
      <div
        className="font-mono font-bold tabular-nums leading-none"
        style={{ fontSize: done ? '14cqmin' : '24cqmin' }}
      >
        {done ? cfg.doneText || 'Nå kjører vi!' : text}
      </div>
    </div>
  );
}
