import { useEffect, useRef, useState } from 'react';
import { alertColors, alertHeading, displayOf, FLASH_MS } from '../../lib/alerts.js';

// Bare meldinger som startet nylig blinker over hele skjermen – ellers ville
// hver omlasting av siden vist en gammel melding over hele skjermen igjen.
const FRESH_MS = 5 * 60_000;

/**
 * Hastemeldinger på skjermen (serveren sender bare de som gjelder nå):
 *  - full:   dekker hele skjermen så lenge meldingen gjelder
 *  - flash:  hele skjermen i 30 sekunder, deretter banner
 *  - banner: stripe øverst på skjermen
 * Fargen følger alvorligheten, eller nivået for farevarsler fra MET.
 */
export default function AlertOverlay({ alerts }) {
  const firstSeen = useRef(new Map()); // id -> da skjermen så meldingen første gang
  const [, rerender] = useState(0);
  const now = Date.now();

  for (const a of alerts) if (!firstSeen.current.has(a.id)) firstSeen.current.set(a.id, now);

  const flashing = (a) => {
    if (displayOf(a) !== 'flash') return false;
    const started = Date.parse(a.starts_at || a.created_at || '') || now;
    if (now - started > FRESH_MS) return false;
    return now - firstSeen.current.get(a.id) < FLASH_MS;
  };
  const isFull = (a) => displayOf(a) === 'full' || flashing(a);

  // Tegn på nytt når en «flash» er ferdig og skal bli banner.
  useEffect(() => {
    const left = alerts.filter(flashing).map((a) => firstSeen.current.get(a.id) + FLASH_MS - Date.now());
    if (!left.length) return undefined;
    const t = setTimeout(() => rerender((n) => n + 1), Math.max(0, Math.min(...left)) + 50);
    return () => clearTimeout(t);
  });

  if (!alerts.length) return null;
  const full = alerts.find(isFull);
  const banners = alerts.filter((a) => a !== full && !isFull(a)).slice(0, 2);

  return (
    <>
      {banners.length > 0 && !full && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex flex-col gap-[0.6vmin] p-[2vmin]">
          {banners.map((a) => (
            <Banner key={a.id} alert={a} />
          ))}
        </div>
      )}
      {full && <FullScreen alert={full} />}
    </>
  );
}

function FullScreen({ alert }) {
  const c = alertColors(alert);
  return (
    <div
      className="fixed inset-0 z-50 flex animate-alert-in flex-col items-center justify-center p-[6vmin] text-center"
      style={{ background: c.bg, color: c.fg }}
    >
      <div className="font-black uppercase tracking-[0.3em] opacity-85" style={{ fontSize: 'clamp(16px, 2.6vmin, 44px)' }}>
        {alertHeading(alert)}
      </div>
      <div className="mt-[4vmin] max-w-[90%] whitespace-pre-line font-extrabold leading-tight" style={{ fontSize: 'clamp(28px, 7vmin, 120px)' }}>
        {alert.message}
      </div>
    </div>
  );
}

function Banner({ alert }) {
  const c = alertColors(alert);
  return (
    <div
      className="flex animate-alert-in items-center gap-[2vmin] rounded-[1.6vmin] px-[2.6vmin] py-[1.8vmin] shadow-2xl"
      style={{ background: c.bg, color: c.fg, fontSize: 'clamp(16px, 2.6vmin, 46px)' }}
    >
      <svg viewBox="0 0 24 24" className="h-[1.3em] w-[1.3em] shrink-0" fill="currentColor" aria-hidden="true">
        <path d="M12 2 1 21h22L12 2Zm0 6 .01 0c.55 0 1 .45 1 1v5a1 1 0 1 1-2 0V9c0-.55.45-1 .99-1Zm0 11.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
      </svg>
      <div className="min-w-0 leading-snug">
        <span className="font-extrabold">{alertHeading(alert)}</span>
        <span className="opacity-90"> · {alert.message}</span>
      </div>
    </div>
  );
}
