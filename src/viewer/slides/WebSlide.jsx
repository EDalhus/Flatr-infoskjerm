import { useEffect, useState } from 'react';

export default function WebSlide({ slide }) {
  const cfg = slide.config || {};
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const mins = Number(cfg.refreshMinutes) || 0;
    if (mins < 1) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), mins * 60_000);
    return () => clearInterval(id);
  }, [cfg.refreshMinutes]);

  if (!cfg.url) {
    return (
      <div className="grid h-full w-full place-items-center rounded-2xl border border-hair bg-card text-muted shadow-card">
        Ingen nettside-URL
      </div>
    );
  }
  return (
    <iframe
      key={tick}
      src={cfg.url}
      title={slide.title || 'Nettside'}
      className="h-full w-full rounded-2xl border border-hair bg-white shadow-card"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    />
  );
}
