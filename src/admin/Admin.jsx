import { useEffect, useState } from 'react';
import { getToken, setToken } from '../lib/api.js';
import { Input, Button } from './components/ui.jsx';
import ScreensManager from './components/ScreensManager.jsx';
import ScheduleManager from './components/ScheduleManager.jsx';
import SponsorsManager from './components/SponsorsManager.jsx';
import AlertsManager from './components/AlertsManager.jsx';

const TABS = [
  { id: 'schedule', label: 'Program', Component: ScheduleManager },
  { id: 'sponsors', label: 'Sponsorer', Component: SponsorsManager },
  { id: 'screens', label: 'Skjermer', Component: ScreensManager },
  { id: 'alerts', label: 'Live Alerts', Component: AlertsManager }
];

export default function Admin() {
  const [tab, setTab] = useState('schedule');
  const [token, setTokenState] = useState(getToken());
  const [savedToken, setSavedToken] = useState(getToken());

  useEffect(() => {
    document.title = 'Admin – Infoskjerm';
  }, []);

  const saveToken = () => {
    setToken(token.trim());
    setSavedToken(token.trim());
  };

  const Active = TABS.find((t) => t.id === tab)?.Component ?? ScheduleManager;

  return (
    <div className="min-h-full bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-black tracking-tight">Infoskjerm · Admin</h1>
            <p className="text-sm text-slate-400">
              Endringer pushes til alle skjermer i sanntid.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={token}
              onChange={(e) => setTokenState(e.target.value)}
              placeholder="ADMIN_TOKEN"
              className="w-44"
            />
            <Button variant="ghost" onClick={saveToken}>
              {savedToken ? 'Oppdater' : 'Lagre'}
            </Button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-5xl gap-1 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-slate-950 text-sky-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Active />
      </main>
    </div>
  );
}
