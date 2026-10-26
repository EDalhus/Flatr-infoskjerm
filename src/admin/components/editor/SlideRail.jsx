// Venstre: lysbildene i presentasjonen. Dra for å endre rekkefølge. Avatarene
// viser hvem som jobber på hvilket lysbilde.

import { useListDnd } from '../../../hooks/useListDnd.js';
import { Icon } from '../ui.jsx';
import SlideThumb from '../deck/SlideThumb.jsx';

const initials = (name = '') =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase() || '?';

export default function SlideRail({ slides, orientation, selectedId, peers, onSelect, onAdd, onDuplicate, onDelete, onMove }) {
  const { rowProps } = useListDnd((from, to) => onMove(from, to));

  return (
    <nav aria-label="Lysbilder" className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-card">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <span className="text-xs font-semibold text-muted">Lysbilder · {slides.length}</span>
        <button
          type="button"
          onClick={onAdd}
          className="grid h-7 w-7 place-items-center rounded-lg text-brand hover:bg-brand-tint"
          aria-label="Nytt lysbilde"
          title="Nytt lysbilde"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
      <ol className="m-0 min-h-0 flex-1 list-none space-y-2 overflow-y-auto px-3 pb-3">
        {slides.map((s, i) => {
          const here = peers.filter((p) => p.slide === s.id);
          const active = s.id === selectedId;
          const { className: dndClass, ...dnd } = rowProps(i);
          return (
            <li key={s.id} {...dnd} className={`group relative rounded-xl ${dndClass}`}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={active ? 'true' : undefined}
                className={`block w-full rounded-xl border-2 p-1.5 text-left transition-colors ${
                  active ? 'border-brand bg-brand-tint' : 'border-transparent hover:bg-zone'
                } ${s.enabled === 0 ? 'opacity-50' : ''}`}
              >
                <div className="relative">
                  <SlideThumb slide={s} orientation={orientation} />
                  {here.length > 0 && (
                    <div className="absolute bottom-1 right-1 flex -space-x-1.5">
                      {here.slice(0, 3).map((p) => (
                        <span
                          key={p.id}
                          title={`${p.name} er her`}
                          className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold text-white ring-2 ring-card"
                          style={{ background: p.color }}
                        >
                          {initials(p.name)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 px-0.5 pt-1.5 text-xs">
                  <span className="font-semibold text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{s.name || 'Lysbilde'}</span>
                  <span className="shrink-0 tabular-nums text-muted">{s.duration_seconds}s</span>
                </div>
              </button>
              <div className="absolute right-2.5 top-2.5 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onDuplicate(s.id)}
                  className="grid h-6 w-6 place-items-center rounded-md bg-card/90 text-ink shadow-card hover:bg-card"
                  aria-label="Dupliser lysbilde"
                  title="Dupliser"
                >
                  <Icon name="copy" className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  className="grid h-6 w-6 place-items-center rounded-md bg-card/90 text-danger shadow-card hover:bg-card"
                  aria-label="Slett lysbilde"
                  title="Slett"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={onAdd}
        className="m-3 mt-0 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-sm font-semibold text-brand hover:bg-brand-tint"
      >
        <Icon name="plus" className="h-4 w-4" />
        Nytt lysbilde
      </button>
    </nav>
  );
}
