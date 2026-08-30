export default function LayoutSlide({ slide }) {
  const cfg = slide.config || {};
  const elements = Array.isArray(cfg.elements) ? cfg.elements : [];
  const bg = cfg.background && cfg.background !== 'transparent' ? cfg.background : '#ffffff';

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-2xl border border-hair shadow-card"
      style={{ backgroundColor: bg }}
    >
      {elements.map((el) => (
        <div
          key={el.id}
          className="absolute overflow-hidden"
          style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}
        >
          {el.kind === 'image' ? (
            <img
              src={el.url}
              alt=""
              className={`h-full w-full ${el.fit === 'cover' ? 'object-cover' : 'object-contain'}`}
            />
          ) : (
            <div className="flex h-full w-full items-center">
              <span
                className="block w-full whitespace-pre-wrap leading-tight"
                style={{
                  fontSize: el.size,
                  fontWeight: el.weight,
                  textAlign: el.align,
                  color: el.color
                }}
              >
                {el.text}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
