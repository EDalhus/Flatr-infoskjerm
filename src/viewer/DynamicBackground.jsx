// Animerte «Dynamiske» bakgrunner – ren CSS/SVG, lett på CPU.
// bg = { type:'dynamic', preset, base, colors:[...], angle, speed }

const withAlpha = (hex, aa) => (/^#[0-9a-fA-F]{6}$/.test(hex || '') ? `${hex}${aa}` : hex || '#34d399');

export default function DynamicBackground({ bg }) {
  const b = bg || {};
  const preset = b.preset || 'aurora';
  const colors = b.colors && b.colors.length ? b.colors : ['#34d399', '#22d3ee', '#3b82f6'];
  const base = b.base || '#0a1a2f';
  const speed = Math.max(0.25, Number(b.speed) || 1);
  const s = (n) => `${Math.round(n / speed)}s`;

  if (preset === 'gradient') {
    const list = colors.length >= 2 ? colors : [...colors, '#0ea5e9'];
    return (
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(${b.angle ?? 130}deg, ${list.join(', ')}, ${list[0]})`,
          backgroundSize: '300% 300%',
          animation: `bgDrift ${s(26)} ease-in-out infinite`
        }}
      />
    );
  }

  if (preset === 'waves') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: base }}>
        {colors.slice(0, 3).map((c, i) => (
          <svg
            key={i}
            viewBox="0 0 1440 320"
            preserveAspectRatio="none"
            className="absolute bottom-0 left-[-25%]"
            style={{
              width: '150%',
              height: `${64 - i * 12}%`,
              opacity: 0.55 - i * 0.1,
              animation: `waveSlide ${s(20 + i * 9)} linear infinite`,
              animationDirection: i % 2 ? 'reverse' : 'normal'
            }}
          >
            <path
              fill={c}
              d="M0,160 C180,250 380,70 720,160 C1060,250 1260,70 1440,160 L1440,320 L0,320 Z"
            />
          </svg>
        ))}
      </div>
    );
  }

  if (preset === 'mesh') {
    const pos = [
      [4, 8],
      [58, 14],
      [22, 56],
      [62, 60]
    ];
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: base }}>
        {colors.slice(0, 4).map((c, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: '62%',
              paddingBottom: '62%',
              left: `${pos[i]?.[0] ?? 20}%`,
              top: `${pos[i]?.[1] ?? 20}%`,
              background: `radial-gradient(circle at 50% 50%, ${c}, transparent 66%)`,
              filter: 'blur(44px)',
              opacity: 0.75,
              animation: `blobFloat${(i % 3) + 1} ${s(22 + i * 6)} ease-in-out infinite alternate`
            }}
          />
        ))}
      </div>
    );
  }

  // aurora
  const pos = [
    [-12, -22],
    [28, 8],
    [46, 26]
  ];
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: base }}>
      {colors.slice(0, 3).map((c, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            width: '95%',
            height: '95%',
            left: `${pos[i]?.[0] ?? 0}%`,
            top: `${pos[i]?.[1] ?? 0}%`,
            background: `radial-gradient(closest-side, ${withAlpha(c, 'cc')}, transparent)`,
            filter: 'blur(64px)',
            mixBlendMode: 'screen',
            opacity: 0.85,
            animation: `blobFloat${(i % 3) + 1} ${s(24 + i * 7)} ease-in-out infinite alternate`
          }}
        />
      ))}
    </div>
  );
}
