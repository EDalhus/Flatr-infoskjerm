import { backgroundStyle, ELEMENT_LABEL } from '../../../lib/deck.js';
import { useListDnd } from '../../../hooks/useListDnd.js';
import { Icon } from '../ui.jsx';

function Thumb({ slide, orientation }) {
  const ratio = orientation === 'portrait' ? '9 / 16' : '16 / 9';
  return (
    <div
      className="relative w-full overflow-hidden rounded"
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
              <div className="grid h-full w-full place-items-center rounded bg-white/85 text-[6px] font-bold uppercase tracking-wide text-brand">
                {ELEMENT_LABEL[el.kind] || el.kind}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SlideNavigator({
  slides,
  orientation,
  selectedId,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove
}) {
  const { rowProps } = useListDnd((from, to) => onMove(from, to));

  return (
    <div className="flex h-full w-52 shrink-0 flex-col border-r border-line bg-paper">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {slides.map((s, i) => (
          <div key={s.id} {...rowProps(i)}>
            <button
              onClick={() => onSelect(s.id)}
              className={`group block w-full rounded-lg border p-1.5 text-left ${
                s.id === selectedId ? 'border-brand bg-brand-tint' : 'border-line bg-card hover:border-brand/50'
              }`}
            >
              <div className="flex items-center justify-between px-0.5 pb-1">
                <span className="text-[11px] font-bold text-muted">{i + 1}</span>
                <span className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(s.id);
                    }}
                    className="grid h-5 w-5 place-items-center rounded text-muted hover:bg-hair"
                    title="Dupliser"
                  >
                    <Icon name="copy" className="h-3 w-3" />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                    className="grid h-5 w-5 place-items-center rounded text-danger hover:bg-danger-tint"
                    title="Slett"
                  >
                    <Icon name="x" className="h-3 w-3" />
                  </span>
                </span>
              </div>
              <Thumb slide={s} orientation={orientation} />
              {s.name && <div className="truncate px-0.5 pt-1 text-[11px] text-ink">{s.name}</div>}
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={onAdd}
        className="m-3 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2 text-xs font-bold uppercase tracking-wide text-brand hover:bg-brand-tint"
      >
        <Icon name="plus" className="h-3.5 w-3.5" />
        Nytt lysbilde
      </button>
    </div>
  );
}
