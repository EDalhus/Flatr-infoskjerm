import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { BASE_SIZE } from '../lib/deck.js';
import { useNow } from '../hooks/useNow.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { useSSE } from '../hooks/useSSE.js';
import { useHeartbeat } from '../hooks/useHeartbeat.js';
import { useFitScale } from '../hooks/useFitScale.js';
import DeckPlayer from './DeckPlayer.jsx';
import AlertOverlay from './components/AlertOverlay.jsx';

const EMPTY = { screen: null, deck: [], categories: [], schedule: [], sponsors: [], alerts: [] };

export default function Viewer() {
  const { screenId } = useParams();
  const now = useNow(1000);
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

  const orientation = state.screen?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const base = BASE_SIZE[orientation];
  const { containerRef, scale } = useFitScale(base.w, base.h);

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

  return (
    <div
      ref={containerRef}
      className="viewer-root relative h-screen w-screen overflow-hidden bg-black text-ink"
    >
      <div
        className="absolute left-1/2 top-1/2 origin-center"
        style={{
          width: base.w,
          height: base.h,
          transform: `translate(-50%, -50%) scale(${scale})`
        }}
      >
        {loaded && !state.screen ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-paper p-16 text-center text-ink">
            <div className="text-5xl font-black">Skjerm {screenId}</div>
            <p className="max-w-xl text-2xl text-muted">
              Fant ikke skjermen. Opprett den i admin, eller sjekk ID-en i adressen.
            </p>
          </div>
        ) : (
          <DeckPlayer deck={state.deck} ctx={ctx} />
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
