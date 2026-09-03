import { backgroundStyle, ELEMENT_LABEL } from '../../../lib/deck.js';

/**
 * Lettvekts miniatyr av ett lysbilde – tekst/bilde/figur tegnes inline,
 * øvrige widgets vises som en merkelapp. Ingen live-data eller tikking.
 * Brukes i lysbilde-navigatoren og i enhets-forhåndsvisningen.
 */
export default function SlideThumb({ slide, orientation }) {
  const ratio = orientation === 'portrait' ? '9 / 16' : '16 / 9';
  return (
    <div
      className="relative w-full overflow-hidden rounded border border-hair"
      style={{ aspectRatio: ratio, ...backgroundStyle(slide.background) }}
    >
      {(slide.elements || []).map((el) => {
        const c = el.config || {};
        const st = { left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` };
        return (
          <div key={el.id} className="absolute overflow-hidden" style={st}>
            {el.kind === 'text' ? (
              <div
                className="h-full w-full overflow-hidden leading-tight"
                style={{
                  fontSize: 7,
                  color: c.color || '#fff',
                  textAlign: c.align || 'left',
                  fontWeight: c.weight || 700
                }}
              >
                {c.text}
              </div>
            ) : el.kind === 'image' && c.url ? (
              <img src={c.url} alt="" className="h-full w-full object-contain" />
            ) : el.kind === 'shape' ? (
              <div
                className="h-full w-full"
                style={{
                  background: c.fill || '#1f5566',
                  borderRadius: c.shape === 'ellipse' ? '50%' : 2,
                  opacity: (c.opacity ?? 100) / 100
                }}
              />
            ) : (
              <div className="grid h-full w-full place-items-center rounded bg-white/85 text-[6px] font-bold uppercase tracking-wide text-[#2b0d40]/60">
                {ELEMENT_LABEL[el.kind] || el.kind}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
