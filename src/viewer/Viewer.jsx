import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { BASE_SIZE } from '../lib/deck.js';
import { useNow } from '../hooks/useNow.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { useSSE } from '../hooks/useSSE.js';
import { useHeartbeat } from '../hooks/useHeartbeat.js';
import { useFitScale } from '../hooks/useFitScale.js';
import { setServerTime } from '../lib/deckClock.js';
import { startPlayLog } from './playLog.js';
import { startOffline, rememberState } from './offline.js';
import { startDevice } from './device.js';
import DeckPlayer from './DeckPlayer.jsx';
import SlideCanvas from './SlideCanvas.jsx';
import AlertOverlay from './components/AlertOverlay.jsx';

const EMPTY = { screen: null, deck: [], overlay: null, categories: [], schedule: [], sponsors: [], alerts: [] };
const NO_BACKGROUND = { type: 'none' };

// Ny versjon av Flatr: last inn på nytt ved neste lysbildebytte, eller senest etter 15 min.
const RELOAD_FALLBACK_MS = 15 * 60_000;

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
  // Visningsloggen (rapporter) gjelder bare ekte skjermer, ikke forhåndsvisning.
  useEffect(() => (preview || playlistId ? undefined : startPlayLog(screenId)), [preview, playlistId, screenId]);

  // Ekte skjermer tåler nettbrudd og oppdaterer seg selv når Flatr får en ny versjon.
  const isScreen = !preview && !playlistId && !!screenId;
  const reloadPending = useRef(false);
  const slideCount = useRef(0);
  useEffect(() => {
    if (!isScreen) return undefined;
    let fallback = null;
    const stop = startOffline(() => {
      // Med ett lysbilde kommer det aldri et bytte å skjule omlastingen i.
      if (slideCount.current < 2) return window.location.reload();
      reloadPending.current = true;
      fallback ??= setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
    });
    return () => {
      stop();
      clearTimeout(fallback);
    };
  }, [isScreen]);
  const onAdvance = useCallback(() => {
    if (reloadPending.current) window.location.reload();
  }, []);

  // Koblet til med kode (flatr.no/tv, Android TV): meld fra som en TV, og vis
  // navnet på skjermen når noen trykker «Identifiser» i admin.
  const [identify, setIdentify] = useState(null);
  useEffect(() => {
    if (!isScreen) return undefined;
    let hide = null;
    const stop = startDevice(screenId, {
      onIdentify: ({ label, seconds }) => {
        setIdentify(label || 'Denne skjermen');
        clearTimeout(hide);
        hide = setTimeout(() => setIdentify(null), Math.min(60, Number(seconds) || 10) * 1000);
      }
    });
    return () => {
      stop();
      clearTimeout(hide);
    };
  }, [isScreen, screenId]);

  const [state, setState] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  slideCount.current = state.deck.length;

  useEffect(() => {
    let alive = true;
    api
      .getState(target)
      .then((data) => {
        if (alive && data) {
          setServerTime(data.serverTime);
          setState(data);
          setLoaded(true);
          if (isScreen) rememberState(api.stateUrl(target), data);
        }
      })
      // Uten nett og uten lagret innhold: vent på strømmen i stedet for å si
      // at skjermen ikke finnes.
      .catch((err) => err.status >= 400 && err.status < 500 && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [target, isScreen]);

  const onData = useCallback(
    (data) => {
      setServerTime(data?.serverTime);
      setState(data);
      setLoaded(true);
      if (isScreen) rememberState(api.stateUrl(target), data);
    },
    [target, isScreen]
  );

  const connected = useSSE(api.streamUrl(target), { snapshot: onData, update: onData });

  // Er organisasjonen (eller skjermen) slettet, svarer serveren 404 i stedet for
  // strømmen. Da lastes siden på nytt, så skjermen ikke viser gammelt innhold for
  // alltid. Uten nett gir sjekken ikke 404, og innholdet blir stående.
  const hasContent = state !== EMPTY;
  useEffect(() => {
    if (!isScreen || connected || !hasContent) return undefined;
    const t = setTimeout(() => {
      api.getState(target).catch((err) => err.status === 404 && window.location.reload());
    }, 20_000);
    return () => clearTimeout(t);
  }, [connected, hasContent, isScreen, target]);

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
          <>
            <DeckPlayer deck={onlySlide ? state.deck.filter((s) => String(s.id) === onlySlide) : state.deck} ctx={ctx} onAdvance={onAdvance} />
            {state.overlay && (
              // Fast felt: ligger over lysbildene og står stille mens de byttes.
              <div className="pointer-events-none absolute inset-0">
                <SlideCanvas slide={{ ...state.overlay, background: NO_BACKGROUND }} ctx={ctx} />
              </div>
            )}
          </>
        )}
      </div>

      <AlertOverlay alerts={state.alerts} />

      {identify && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 p-[6vmin] text-center text-white">
          <div className="text-[3vmin] font-semibold uppercase tracking-[0.3em] text-[#7ee2b8]">Denne skjermen</div>
          <div className="mt-[2vmin] max-w-full break-words text-[10vmin] font-black leading-tight">{identify}</div>
        </div>
      )}

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
