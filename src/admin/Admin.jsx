import { useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../lib/api.js';
import { Icon, Input, Button } from './components/ui.jsx';
import ScheduleManager from './components/ScheduleManager.jsx';
import CategoriesManager from './components/CategoriesManager.jsx';
import SponsorsManager from './components/SponsorsManager.jsx';
import ScreensManager from './components/ScreensManager.jsx';
import AlertsManager from './components/AlertsManager.jsx';

const NAV = [
  { id: 'schedule', label: 'Program', icon: 'calendar', Component: ScheduleManager },
  { id: 'categories', label: 'Kategorier', icon: 'tag', Component: CategoriesManager },
  { id: 'sponsors', label: 'Sponsorer', icon: 'image', Component: SponsorsManager },
  { id: 'screens', label: 'Skjermer', icon: 'monitor', Component: ScreensManager },
  { id: 'alerts', label: 'Live Alerts', icon: 'megaphone', Component: AlertsManager }
];

const initialTab = () => {
  if (typeof window === 'undefined') return 'schedule';
  const v = new URLSearchParams(window.location.search).get('view');
  return NAV.some((n) => n.id === v) ? v : 'schedule';
};

export default function Admin() {
  const [tab, setTab] = useState(initialTab);
  const [token, setTokenState] = useState(getToken());
  const [savedToken, setSavedToken] = useState(getToken());
  const [screenCount, setScreenCount] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    document.title = 'Admin · Infoskjerm';
  }, []);

  useEffect(() => {
    api.screens
      .list()
      .then((r) => setScreenCount(Array.isArray(r) ? r.length : null))
      .catch(() => setScreenCount(null));
  }, [tab, refreshKey]);

  const saveToken = () => {
    const t = token.trim();
    setToken(t);
    setSavedToken(t);
    setRefreshKey((k) => k + 1);
  };

  const bump = () => setRefreshKey((k) => k + 1);
  const Active = useMemo(() => NAV.find((n) => n.id === tab)?.Component ?? ScheduleManager, [tab]);

  return (
    <div className="flex h-screen overflow-hidden bg-paper text-ink">
      {/* smal merkevare-rail */}
      <div className="hidden w-14 shrink-0 flex-col items-center bg-brand py-4 text-white sm:flex">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-white text-lg font-black text-brand">
          F
        </div>
        <div className="mt-4 grid h-9 w-9 place-items-center rounded-lg bg-white/15">
          <Icon name="calendar" className="h-5 w-5" />
        </div>
        <a
          href="/display/1"
          className="mt-auto grid h-9 w-9 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          title="Åpne en skjermvisning"
        >
          <Icon name="external" className="h-5 w-5" />
        </a>
      </div>

      {/* sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-paper sm:w-64">
        <div className="px-5 py-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Infoskjerm
          </div>
          <div className="text-sm font-black tracking-tight text-ink">FLATR ADMIN</div>
        </div>

        <div className="px-3">
          <div className="px-2 pb-2 pt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            Administrer
          </div>
          <nav className="space-y-0.5">
            {NAV.map((n) => {
              const active = n.id === tab;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    setTab(n.id);
                    if (typeof window !== 'undefined') {
                      const url = new URL(window.location.href);
                      url.searchParams.set('view', n.id);
                      window.history.replaceState(null, '', url);
                    }
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-brand-tint text-brand'
                      : 'text-ink/80 hover:bg-black/[0.04] hover:text-ink'
                  }`}
                >
                  <Icon name={n.icon} className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{n.label}</span>
                  {n.id === 'screens' && screenCount != null && (
                    <span className="rounded-full bg-ok-tint px-1.5 text-xs font-bold text-ok">
                      {screenCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-line p-4">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            Admin-token
          </div>
          <div className="flex gap-1.5">
            <Input
              type="password"
              value={token}
              onChange={(e) => setTokenState(e.target.value)}
              placeholder="valgfritt"
              className="h-9 text-sm"
            />
            <Button size="sm" variant="outline" onClick={saveToken}>
              {savedToken ? 'OK' : 'Lagre'}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-snug text-muted">
            Kreves bare når <code className="rounded bg-black/5 px-1">ADMIN_TOKEN</code> er satt i
            produksjon.
          </p>
        </div>
      </aside>

      {/* innhold */}
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Active onChange={bump} />
      </main>
    </div>
  );
}
