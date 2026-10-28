import { useEffect, useState } from 'react';
import { externalUrl } from '../../lib/safeUrl.js';

export default function WebSlide({ slide }) {
  const cfg = slide.config || {};
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const mins = Number(cfg.refreshMinutes) || 0;
    if (mins < 1) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), mins * 60_000);
    return () => clearInterval(id);
  }, [cfg.refreshMinutes]);

  // Bare vanlige nettadresser – aldri javascript: o.l. (ville kjørt i Flatrs domene).
  const url = externalUrl(cfg.url);
  if (!url) {
    return (
      <div className="grid h-full w-full place-items-center rounded-2xl border border-hair bg-card text-muted shadow-card">
        {cfg.url ? 'Ugyldig adresse – bruk en adresse som starter med https://' : 'Ingen nettside-URL'}
      </div>
    );
  }
  return (
    <iframe
      key={tick}
      src={url}
      title={slide.title || 'Nettside'}
      className="h-full w-full rounded-2xl border border-hair bg-white shadow-card"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    />
  );
}
