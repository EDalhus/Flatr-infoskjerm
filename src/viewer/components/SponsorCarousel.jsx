import { useEffect, useState } from 'react';

/** Roterer sponsorlogoer – kun bildet, ingen ramme, ingen tekst. */
export default function SponsorCarousel({ sponsors }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= sponsors.length && sponsors.length > 0) setIndex(0);
  }, [sponsors.length, index]);

  useEffect(() => {
    if (sponsors.length < 2) return undefined;
    const current = sponsors[index % sponsors.length];
    const seconds = Math.max(2, Number(current?.duration_seconds) || 10);
    const id = setTimeout(() => setIndex((i) => (i + 1) % sponsors.length), seconds * 1000);
    return () => clearTimeout(id);
  }, [sponsors, index]);

  if (sponsors.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-current opacity-40">
        Ingen sponsorer
      </div>
    );
  }

  const sponsor = sponsors[index % sponsors.length];
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <img
        key={sponsor.id}
        src={sponsor.image_url}
        alt={sponsor.name}
        className="max-h-full max-w-full animate-fade-in object-contain"
      />
    </div>
  );
}
