import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { partitionSchedule } from '../lib/time.js';
import { useNow } from '../hooks/useNow.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { useSSE } from '../hooks/useSSE.js';
import Clock from './components/Clock.jsx';
import NowNext from './components/NowNext.jsx';
import ProgramPanel from './components/ProgramPanel.jsx';
import SponsorCarousel from './components/SponsorCarousel.jsx';
import MessageBoard from './components/MessageBoard.jsx';
import AlertOverlay from './components/AlertOverlay.jsx';

const EMPTY = { screen: null, schedule: [], sponsors: [], alerts: [] };

export default function Viewer() {
  const { screenId } = useParams();
  const now = useNow(1000);
  useWakeLock(true);

  const [state, setState] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);

  // Startlasting (og fallback hvis SSE ikke er tilgjengelig).
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

  const connected = useSSE(api.streamUrl(screenId), {
    snapshot: onData,
    update: onData
  });

  const { sorted, nowItem, nextItem } = partitionSchedule(state.schedule, now);

  return (
    <div className="viewer-root flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-slate-50 landscape:flex-row">
      {/* HOVEDPROGRAM – 70 % (liggende) / 65 % (stående) */}
      <main className="flex min-h-0 flex-col gap-4 p-6 landscape:h-full landscape:w-[70%] portrait:h-[65%] portrait:w-full">
        <header className="flex shrink-0 items-baseline justify-between">
          <h1 className="text-3xl font-black tracking-tight portrait:text-2xl">
            {state.screen?.name || 'Infoskjerm'}
          </h1>
          {state.screen?.location && (
            <span className="text-lg text-slate-400">{state.screen.location}</span>
          )}
        </header>

        <NowNext nowItem={nowItem} nextItem={nextItem} now={now} />
        <ProgramPanel items={sorted} nowItemId={nowItem?.id} />
      </main>

      {/* SIDEPANEL – 30 % (liggende) / 35 % (stående) */}
      <aside className="flex min-h-0 flex-col gap-4 border-slate-800 bg-slate-900 p-6 landscape:h-full landscape:w-[30%] landscape:border-l portrait:h-[35%] portrait:w-full portrait:border-t">
        <Clock now={now} />
        <SponsorCarousel sponsors={state.sponsors} />
        <MessageBoard alerts={state.alerts} />
      </aside>

      <AlertOverlay alerts={state.alerts} />

      {/* Diskret tilkoblingsindikator */}
      <div
        className={`fixed bottom-3 right-3 h-2.5 w-2.5 rounded-full transition-colors ${
          connected ? 'bg-emerald-500' : loaded ? 'bg-amber-500' : 'bg-slate-600'
        }`}
        title={connected ? 'Live' : 'Kobler til …'}
      />
    </div>
  );
}
