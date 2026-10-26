// Værsymboler for MET/Yr sine symbolkoder (f.eks. "partlycloudy_day",
// "lightrainshowers_night", "heavysnow"). Egne, enkle SVG-er.

function kindOf(code = '') {
  const c = code.replace(/_(day|night|polartwilight)$/, '');
  if (c.includes('thunder')) return 'thunder';
  if (c.includes('sleet')) return 'sleet';
  if (c.includes('snow')) return 'snow';
  if (c.includes('rain')) return 'rain';
  if (c === 'fog') return 'fog';
  if (c === 'cloudy') return 'cloudy';
  if (c === 'partlycloudy' || c === 'fair') return 'partly';
  return 'clear';
}

const Sun = () => (
  <g>
    <circle cx="32" cy="32" r="11" fill="#fbbf24" />
    {Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return (
        <line
          key={i}
          x1={32 + Math.cos(a) * 16}
          y1={32 + Math.sin(a) * 16}
          x2={32 + Math.cos(a) * 22}
          y2={32 + Math.sin(a) * 22}
          stroke="#fbbf24"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      );
    })}
  </g>
);
const Moon = () => <path d="M38 14a18 18 0 1 0 12 30A15 15 0 0 1 38 14z" fill="#e2e8f0" />;
const Cloud = ({ dark, dx = 0, dy = 0 }) => (
  <path
    transform={`translate(${dx} ${dy})`}
    d="M20 50h26a11 11 0 0 0 1-22 15 15 0 0 0-28 4 9 9 0 0 0 1 18z"
    fill={dark ? '#94a3b8' : '#f1f5f9'}
  />
);
const Drops = ({ n = 3, color = '#60a5fa' }) => (
  <g stroke={color} strokeWidth="3.5" strokeLinecap="round">
    {Array.from({ length: n }, (_, i) => (
      <line key={i} x1={24 + i * 9} y1="54" x2={21 + i * 9} y2="61" />
    ))}
  </g>
);
const Flakes = () => (
  <g fill="#e0f2fe">
    {[24, 33, 42].map((x) => (
      <circle key={x} cx={x} cy="58" r="2.8" />
    ))}
  </g>
);

export default function WeatherIcon({ code, className = '', title }) {
  const kind = kindOf(code);
  const night = /_night$/.test(code || '');
  const heavy = /heavy/.test(code || '');
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={title || 'Vær'}>
      {kind === 'clear' && (night ? <Moon /> : <Sun />)}
      {kind === 'partly' && (
        <>
          <g transform="translate(-8 -8) scale(0.85)">{night ? <Moon /> : <Sun />}</g>
          <Cloud dx={4} dy={2} />
        </>
      )}
      {kind === 'cloudy' && (
        <>
          <Cloud dark dx={-6} dy={-6} />
          <Cloud dx={2} dy={0} />
        </>
      )}
      {kind === 'fog' && (
        <g stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round">
          <line x1="12" y1="26" x2="52" y2="26" />
          <line x1="8" y1="36" x2="48" y2="36" />
          <line x1="16" y1="46" x2="56" y2="46" />
        </g>
      )}
      {(kind === 'rain' || kind === 'sleet' || kind === 'snow' || kind === 'thunder') && (
        <>
          <Cloud dark={heavy || kind === 'thunder'} dy={-6} />
          {kind === 'rain' && <Drops n={heavy ? 4 : 3} />}
          {kind === 'snow' && <Flakes />}
          {kind === 'sleet' && (
            <>
              <Drops n={2} />
              <circle cx="44" cy="58" r="2.8" fill="#e0f2fe" />
            </>
          )}
          {kind === 'thunder' && <path d="M34 44l-7 11h6l-3 9 10-13h-6l4-7z" fill="#facc15" />}
        </>
      )}
    </svg>
  );
}
