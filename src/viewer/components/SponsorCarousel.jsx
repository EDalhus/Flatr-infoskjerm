import { useEffect, useState } from 'react';

export default function SponsorCarousel({ sponsors }) {
  const [index, setIndex] = useState(0);

  // Hold indeksen innenfor lista når den endrer lengde.
  useEffect(() => {
    if (index >= sponsors.length && sponsors.length > 0) setIndex(0);
  }, [sponsors.length, index]);

  useEffect(() => {
    if (sponsors.length < 2) return undefined;
    const current = sponsors[index % sponsors.length];
    const seconds = Math.max(2, Number(current?.duration_seconds) || 10);
    const id = setTimeout(
      () => setIndex((i) => (i + 1) % sponsors.length),
      seconds * 1000
    );
    return () => clearTimeout(id);
  }, [sponsors, index]);

  if (sponsors.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-2xl bg-slate-800/40 text-slate-500">
        Ingen sponsorer
      </div>
    );
  }

  const sponsor = sponsors[index % sponsors.length];

  return (
    <div className="flex flex-1 flex-col rounded-2xl bg-white/95 p-4">
      <div className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
        Takk til våre sponsorer
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <img
          key={sponsor.id}
          src={sponsor.image_url}
          alt={sponsor.name}
          className="max-h-full max-w-full animate-fade-in object-contain"
        />
      </div>
      <div className="mt-2 text-center text-sm font-semibold text-slate-700">
        {sponsor.name}
      </div>
      {sponsors.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {sponsors.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 w-1.5 rounded-full ${
                i === index % sponsors.length ? 'bg-slate-800' : 'bg-slate-300'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
