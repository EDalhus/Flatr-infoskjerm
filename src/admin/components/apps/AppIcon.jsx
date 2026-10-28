import { Icon } from '../ui.jsx';

const BG = { white: '#ffffff', black: '#000000' };

/**
 * Appikonet. Med egen logo (image = { url, bg }) vises bildet på valgt
 * bakgrunn (transparent, hvit eller svart); ellers farget flate med et ikon
 * fra ikonsettet.
 */
export default function AppIcon({ icon = 'sparkle', color = '#5b5bd6', size = 56, image }) {
  const radius = Math.round(size * 0.24);
  if (image?.url) {
    const bg = BG[image.bg];
    return (
      <span
        className={`grid shrink-0 place-items-center overflow-hidden ${bg ? 'shadow-card' : 'ring-1 ring-inset ring-line'}`}
        style={{ width: size, height: size, borderRadius: radius, background: bg || 'transparent' }}
        aria-hidden="true"
      >
        <img src={image.url} alt="" className="h-full w-full object-contain" style={{ padding: bg ? size * 0.12 : 0 }} draggable={false} />
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center text-white shadow-card"
      style={{ width: size, height: size, borderRadius: radius, background: `linear-gradient(145deg, ${color}, ${color}cc)` }}
      aria-hidden="true"
    >
      <Icon name={icon} className="h-1/2 w-1/2" />
    </span>
  );
}
