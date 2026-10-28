import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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
  // /display/:screenId = en kanal. /preview/:playlistId = forhåndsvisning av
  // en presentasjon fra admin (krever innlogging, ingen kanal).
  const { screenId, playlistId } = useParams();
  const [params] = useSearchParams();
  // ?preview=1 – innebygd i admin-panelet: ikke meld heartbeat / hold skjermen våken.
  const preview = params.get('preview') === '1' || !!playlistId;
  // ?slide=ID – bare ett lysbilde (AI-assistenten tar skjermbilde av det den lager).
  const onlySlide = params.get('slide');
  const rt = params.get('rt'); // signert tilgang (AI-assistentens skjermbilder)
  const target = useMemo(() => (playlistId ? { playlist: playlistId, rt } : screenId), [playlistId, screenId, rt]);
  const now = useNow(1000);
  useWakeLock(!preview);
  useHeartbeat(preview || playlistId ? null : screenId);

  const [state, setState] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getState(target)
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
  }, [target]);

  const onData = useCallback((data) => {
    setState(data);
    setLoaded(true);
  }, []);

  const connected = useSSE(api.streamUrl(target), { snapshot: onData, update: onData });

  const orientation = state.screen?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const base = BASE_SIZE[orientation];
  // Fjernstyrt rotasjon (grader) for fysisk montering – styres fra admin.
  // I forhåndsvisning (admin-panel) vises innholdet slik det er designet, urotert.
  const rotation = preview ? 0 : (((Number(state.screen?.rotation) || 0) % 360) + 360) % 360;
  const rad = (rotation * Math.PI) / 180;
  const boxW = Math.abs(base.w * Math.cos(rad)) + Math.abs(base.h * Math.sin(rad));
  const boxH = Math.abs(base.w * Math.sin(rad)) + Math.abs(base.h * Math.cos(rad));
  const measured = useFitScale(boxW, boxH);
  const containerRef = measured.containerRef;
  // ?vw=&vh= – fast visningsstørrelse (skjermbilder tatt av serveren, der vinduet
  // måles før det får sin endelige størrelse).
  const fixedW = Number(params.get('vw')) || 0;
  const fixedH = Number(params.get('vh')) || 0;
  const scale = fixedW && fixedH ? Math.min(fixedW / boxW, fixedH / boxH) : measured.scale;

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
      style={fixedW && fixedH ? { width: fixedW, height: fixedH } : undefined}
    >
      <div
        className="absolute left-1/2 top-1/2 origin-center"
        style={{
          width: base.w,
          height: base.h,
          transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`
        }}
      >
        {state.screen?.power === 'off' ? (
          // Tidsplanen sier «skjerm av»: helt svart (sparer panelet og strøm).
          <div className="h-full w-full bg-black" />
        ) : loaded && !state.screen ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-paper p-16 text-center text-ink">
            <div className="text-5xl font-black">{playlistId ? 'Presentasjon' : `Skjerm ${screenId}`}</div>
            <p className="max-w-xl text-2xl text-muted">
              {playlistId
                ? 'Fant ikke presentasjonen, eller du er ikke logget inn.'
                : 'Fant ikke skjermen. Opprett den i admin, eller sjekk ID-en i adressen.'}
            </p>
          </div>
        ) : (
          <DeckPlayer deck={onlySlide ? state.deck.filter((s) => String(s.id) === onlySlide) : state.deck} ctx={ctx} />
        )}
      </div>

      <AlertOverlay alerts={state.alerts} />

      {!preview && (
        <div
          className={`fixed bottom-3 right-3 h-2.5 w-2.5 rounded-full transition-colors ${
            connected ? 'bg-ok' : loaded ? 'bg-amber-500' : 'bg-muted'
          }`}
          title={connected ? 'Live' : 'Kobler til …'}
        />
      )}
    </div>
  );
}
