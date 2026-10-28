import { useMemo } from 'react';

// Kakeregn: kaker og konfetti som faller over flaten (Bursdager-appen).
// Rene CSS-animasjoner, så det går fint også på svake skjermer.

const EMOJIS = ['🎂', '🎉', '🎊', '🥳', '🧁', '🎈', '🍰', '🎁'];
const AMOUNT = { few: 14, normal: 26, many: 44 };

// Fast «tilfeldighet» per element, så regnet ikke hopper ved hver ny tegning.
function seeded(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export default function CakeRain({ amount = 'normal', opacity = 1, seed = 1, still = false }) {
  const drops = useMemo(() => {
    const rnd = seeded(Number(seed) * 7919 + 13);
    const n = AMOUNT[amount] || AMOUNT.normal;
    return Array.from({ length: n }, (_, i) => ({
      emoji: EMOJIS[Math.floor(rnd() * EMOJIS.length)],
      left: rnd() * 100,
      size: 3.5 + rnd() * 4.5, // cqmin
      duration: 6 + rnd() * 7,
      delay: -rnd() * 13, // negativ: regnet er allerede i gang når det vises
      sway: (rnd() - 0.5) * 16,
      spin: (rnd() - 0.5) * 720,
      top: rnd() * 100,
      key: i
    }));
  }, [amount, seed]);

  return (
    <div
      className="pointer-events-none relative h-full w-full overflow-hidden"
      style={{ containerType: 'size', opacity: Math.min(1, Math.max(0.1, Number(opacity) || 1)) }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes flatr-cake-fall {
          from { transform: translate3d(0, -15cqh, 0) rotate(0deg); }
          to { transform: translate3d(var(--sway), 115cqh, 0) rotate(var(--spin)); }
        }
      `}</style>
      {drops.map((d) => (
        <span
          key={d.key}
          className="absolute top-0 leading-none"
          style={{
            left: `${d.left}%`,
            fontSize: `${d.size}cqmin`,
            '--sway': `${d.sway}cqw`,
            '--spin': `${d.spin}deg`,
            ...(still
              ? { transform: `translateY(${d.top}cqh) rotate(${d.spin / 4}deg)` }
              : { animation: `flatr-cake-fall ${d.duration}s linear ${d.delay}s infinite`, willChange: 'transform' })
          }}
        >
          {d.emoji}
        </span>
      ))}
    </div>
  );
}
