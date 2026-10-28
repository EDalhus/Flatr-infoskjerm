import { backgroundStyle, ELEMENT_LABEL, BASE_SIZE } from '../../../lib/deck.js';

/**
 * Lettvekts miniatyr av ett lysbilde – tekst/bilde/figur tegnes inline,
 * øvrige widgets vises som en merkelapp. Ingen live-data eller tikking.
 * Tekst skaleres etter miniatyrens bredde (container-enheter), så den ser ut
 * som på skjermen. Brukes i lysbilde-navigatoren og i malmarkedet.
 */
export default function SlideThumb({ slide, orientation }) {
  const ratio = orientation === 'portrait' ? '9 / 16' : '16 / 9';
  const baseW = BASE_SIZE[orientation === 'portrait' ? 'portrait' : 'landscape'].w;
  return (
    <div
      className="relative w-full overflow-hidden rounded border border-hair"
      style={{ aspectRatio: ratio, containerType: 'inline-size', ...backgroundStyle(slide.background) }}
    >
      {(slide.elements || []).filter((el) => el.config?.hidden !== true).map((el, i) => {
        const c = el.config || {};
        const st = { left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` };
        return (
          <div key={el.id ?? i} className="absolute overflow-hidden" style={st}>
            {el.kind === 'text' ? (
              <div
                className="h-full w-full overflow-hidden leading-tight"
                style={{
                  fontSize: `calc(${Number(c.size) || 64} * 100cqw / ${baseW})`,
                  fontFamily: c.font || undefined,
                  fontStyle: c.italic ? 'italic' : undefined,
                  lineHeight: c.lineHeight || 1.1,
                  whiteSpace: 'pre-wrap',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: c.valign === 'middle' ? 'center' : c.valign === 'bottom' ? 'flex-end' : 'flex-start',
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
              <div className="grid h-full w-full place-items-center rounded bg-white/85 text-[6px] font-bold text-[#2b0d40]/60">
                {ELEMENT_LABEL[el.kind] || el.kind}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
