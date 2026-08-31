import { backgroundStyle } from '../lib/deck.js';
import ElementView from './ElementView.jsx';

/** Ett lysbilde: bakgrunn + posisjonerte elementer (prosent av canvas). */
export default function SlideCanvas({ slide, ctx, onNext }) {
  const elements = [...(slide.elements || [])].sort((a, b) => a.z - b.z || a.id - b.id);
  return (
    <div
      className="absolute inset-0 overflow-hidden text-white"
      style={backgroundStyle(slide.background)}
    >
      {elements.map((el) => (
        <div
          key={el.id}
          className="absolute"
          style={{
            left: `${el.x}%`,
            top: `${el.y}%`,
            width: `${el.w}%`,
            height: `${el.h}%`,
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined
          }}
        >
          <ElementView element={el} ctx={ctx} onNext={onNext} />
        </div>
      ))}
    </div>
  );
}
