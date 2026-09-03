import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import SlideThumb from './deck/SlideThumb.jsx';

// Forhåndsvisning av alle lysbildene som spilles av på en gitt skjerm.
// Henter skjermens tilstand én gang pr. montering (skjerm-id).
export default function DeckPreviewStrip({ screenId }) {
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!screenId) return undefined;
    let alive = true;
    setState(null);
    setFailed(false);
    api
      .getState(screenId)
      .then((s) => alive && s && setState(s))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [screenId]);

  if (!screenId) return null;

  const orientation = state?.screen?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const slides = state?.deck ?? [];

  return (
    <div className="px-4 pb-3 sm:px-5">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        Spilles av{state?.screen?.name ? ` på ${state.screen.name}` : ''}
        {slides.length ? ` · ${slides.length} lysbilder` : ''}
      </div>

      {!state && !failed && <div className="text-xs text-muted">Laster forhåndsvisning …</div>}
      {failed && <div className="text-xs text-danger">Kunne ikke hente lysbildene.</div>}
      {state && slides.length === 0 && (
        <div className="text-xs text-muted">Ingen lysbilder på denne skjermen ennå.</div>
      )}

      {slides.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {slides.map((s, i) => (
            <div
              key={s.id}
              className={`shrink-0 ${orientation === 'portrait' ? 'w-14' : 'w-24'}`}
              title={s.name || `Lysbilde ${i + 1}`}
            >
              <SlideThumb slide={s} orientation={orientation} />
              <div className="pt-0.5 text-center text-[10px] tabular-nums text-muted">{i + 1}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
