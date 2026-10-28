// Venstre: lysbildene i presentasjonen. Dra for å endre rekkefølge. Avatarene
// viser hvem som jobber på hvilket lysbilde.

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
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

/** Merke for dato-begrensning: «Utløpt», «Til 3. nov», «Fra 5. nov». */
function period(s) {
  const today = new Date().toISOString().slice(0, 10);
  const fmt = (d) => new Date(`${d}T12:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace('.', '');
  if (s.active_to_date && s.active_to_date < today) return { text: 'Utløpt', tone: 'bg-danger-tint text-danger' };
  if (s.active_from_date && s.active_from_date > today) return { text: `Fra ${fmt(s.active_from_date)}`, tone: 'bg-zone text-muted' };
  if (s.active_to_date) return { text: `Til ${fmt(s.active_to_date)}`, tone: 'bg-warn/15 text-warn' };
  return null;
}

export default function SlideRail({ slides, orientation, selectedId, peers, onSelect, onAdd, onDuplicate, onDelete, onMove, onCopyTo, onAi, playlistId }) {
  const { rowProps } = useListDnd((from, to) => onMove(from, to));
  // «Kopier til …»: de andre presentasjonene, hentet når menyen åpnes.
  const [copyFor, setCopyFor] = useState(null);
  const [aiFor, setAiFor] = useState(null);
  const [others, setOthers] = useState(null);
  useEffect(() => {
    if (!copyFor || others) return;
    api.playlists
      .list()
      .then((rows) => setOthers((rows || []).filter((p) => String(p.id) !== String(playlistId))))
      .catch(() => setOthers([]));
  }, [copyFor, others, playlistId]);

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
                {period(s) && (
                  <div className={`mx-0.5 mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${period(s).tone}`}>{period(s).text}</div>
                )}
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
                {onAi && (
                  <button
                    type="button"
                    onClick={() => setAiFor(aiFor === s.id ? null : s.id)}
                    className="grid h-6 w-6 place-items-center rounded-md bg-card/90 text-brand shadow-card hover:bg-card"
                    aria-label="AI for dette lysbildet"
                    title="AI for dette lysbildet"
                  >
                    <Icon name="sparkle" className="h-3.5 w-3.5" />
                  </button>
                )}
                {onCopyTo && (
                  <button
                    type="button"
                    onClick={() => setCopyFor(copyFor === s.id ? null : s.id)}
                    className="grid h-6 w-6 place-items-center rounded-md bg-card/90 text-ink shadow-card hover:bg-card"
                    aria-label="Kopier til en annen presentasjon"
                    title="Kopier til en annen presentasjon"
                  >
                    <Icon name="share" className="h-3.5 w-3.5" />
                  </button>
                )}
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
              {aiFor === s.id && (
                <div className="absolute left-2 right-2 top-9 z-20 rounded-xl border border-line bg-card p-1 shadow-pop">
                  {[
                    ['better', 'Forbedre designet'],
                    ['variants', 'Lag 3 varianter'],
                    ['shorter', 'Kortere og tydeligere tekst']
                  ].map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setAiFor(null);
                        onAi(s, k);
                      }}
                      className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-zone"
                    >
                      ✦ {label}
                    </button>
                  ))}
                </div>
              )}
              {copyFor === s.id && (
                <div className="absolute left-2 right-2 top-9 z-20 max-h-64 overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-pop">
                  <div className="px-2 py-1.5 text-[11px] font-semibold text-muted">Kopier til …</div>
                  {!others && <div className="px-2 py-1.5 text-xs text-muted">Laster …</div>}
                  {others?.length === 0 && <div className="px-2 py-1.5 text-xs text-muted">Ingen andre presentasjoner.</div>}
                  {others?.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setCopyFor(null);
                        onCopyTo(s.id, p);
                      }}
                      className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-zone"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
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
