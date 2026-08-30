import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { resolveZones } from '../lib/layouts.js';
import { useNow } from '../hooks/useNow.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { useSSE } from '../hooks/useSSE.js';
import { useOrientation } from '../hooks/useOrientation.js';
import { useHeartbeat } from '../hooks/useHeartbeat.js';
import { useFitScale } from '../hooks/useFitScale.js';
import Zone from './Zone.jsx';
import AlertOverlay from './components/AlertOverlay.jsx';

const EMPTY = { screen: null, slides: [], categories: [], schedule: [], sponsors: [], alerts: [] };

// Fast «design-lerret». Alt måles i px mot dette og skaleres for å passe skjermen.
const BASE = {
  landscape: { w: 1920, h: 1080 },
  portrait: { w: 1080, h: 1920 }
};

export default function Viewer() {
  const { screenId } = useParams();
  const now = useNow(1000);
  const orientation = useOrientation();
  useWakeLock(true);
  useHeartbeat(screenId);

  const [state, setState] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getState(screenId)
      .then((data) => {
        if (alive && data) {
          setState(data);
          setLoaded(true);
        }
      })
      .catch(() => setLoaded(true));
    return () => {
      alive = false;
    };
  }, [screenId]);

  const onData = useCallback((data) => {
    setState(data);
    setLoaded(true);
  }, []);

  const connected = useSSE(api.streamUrl(screenId), { snapshot: onData, update: onData });

  const base = BASE[orientation] || BASE.landscape;
  const { containerRef, scale } = useFitScale(base.w, base.h);

  const zones = useMemo(
    () => resolveZones(state.screen, orientation),
    [state.screen, orientation]
  );
  const slidesByZone = useMemo(() => {
    const map = {};
    for (const s of state.slides) (map[s.zone] ||= []).push(s);
    return map;
  }, [state.slides]);

  const ctx = useMemo(
    () => ({
      schedule: state.schedule,
      sponsors: state.sponsors,
      categories: state.categories,
      screenId,
      now
    }),
    [state.schedule, state.sponsors, state.categories, screenId, now]
  );

  const rotation = state.screen?.rotation_seconds || 15;
  const hasContent = state.slides.length > 0;

  return (
    <div
      ref={containerRef}
      className="viewer-root relative h-screen w-screen overflow-hidden bg-paper text-ink"
    >
      <div
        className="absolute left-1/2 top-1/2 origin-center"
        style={{
          width: base.w,
          height: base.h,
          transform: `translate(-50%, -50%) scale(${scale})`
        }}
      >
        {hasContent &&
          zones.map((z) => (
            <div
              key={z.id}
              className="absolute overflow-hidden p-3"
              style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
            >
              <Zone slides={slidesByZone[z.id] || []} rotationSeconds={rotation} ctx={ctx} />
            </div>
          ))}

        {loaded && !hasContent && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-16 text-center">
            <div className="text-5xl font-black text-ink">
              {state.screen?.name || `Skjerm ${screenId ?? ''}`}
            </div>
            <p className="max-w-xl text-2xl text-muted">
              {state.screen
                ? 'Ingen slides er satt opp for denne skjermen ennå. Legg til innhold i admin → Skjermer.'
                : 'Fant ikke skjermen. Opprett den i admin, eller sjekk ID-en i adressen.'}
            </p>
          </div>
        )}
      </div>

      <AlertOverlay alerts={state.alerts} />

      <div
        className={`fixed bottom-3 right-3 h-2.5 w-2.5 rounded-full transition-colors ${
          connected ? 'bg-ok' : loaded ? 'bg-amber-500' : 'bg-muted'
        }`}
        title={connected ? 'Live' : 'Kobler til …'}
      />
    </div>
  );
}
