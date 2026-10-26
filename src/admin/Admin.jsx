import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Icon } from './components/ui.jsx';
import Dashboard from './components/Dashboard.jsx';
import ProgramManager from './components/ProgramManager.jsx';
import SponsorsManager from './components/SponsorsManager.jsx';
import MediaLibraryManager from './components/MediaLibraryManager.jsx';
import TemplatesManager from './components/TemplatesManager.jsx';
import ScreensManager from './components/ScreensManager.jsx';
import PlaylistsManager from './components/PlaylistsManager.jsx';
import TimetableManager from './components/TimetableManager.jsx';
import ReportsManager from './components/ReportsManager.jsx';
import AlertsManager from './components/AlertsManager.jsx';
import PairingManager from './components/PairingManager.jsx';
import RecentlyDeletedManager from './components/RecentlyDeletedManager.jsx';
import TeamManager from './components/TeamManager.jsx';
import Login from './Login.jsx';
import ThemePicker, { useTheme } from './components/ThemePicker.jsx';
import OnlineBar from './components/OnlineBar.jsx';
import { LogoMark, LogoLockup } from './components/Logo.jsx';
import { useCollab } from '../hooks/useCollab.js';

// `group` styrer hvor punktet vises: i hovednavigasjonen ('main'), i
// Innhold-menyen ('content') eller i brukermenyen ('account').
const NAV = [
  { id: 'dashboard', label: 'Hjem', icon: 'home', group: 'main', Component: Dashboard },
  { id: 'screens', label: 'Skjermer', icon: 'monitor', group: 'main', Component: ScreensManager },
  { id: 'playlists', label: 'Spillelister', icon: 'layers', group: 'main', Component: PlaylistsManager },
  { id: 'timetable', label: 'Tidsplan', icon: 'clock', group: 'main', Component: TimetableManager },
  { id: 'alerts', label: 'Varsler', icon: 'megaphone', group: 'main', Component: AlertsManager },
  { id: 'pairing', label: 'Enheter', icon: 'link', group: 'main', Component: PairingManager },
  { id: 'schedule', label: 'Program', icon: 'calendar', group: 'content', Component: ProgramManager },
  { id: 'sponsors', label: 'Sponsorer', icon: 'image', group: 'content', Component: SponsorsManager },
  { id: 'media', label: 'Bibliotek', icon: 'image', group: 'content', Component: MediaLibraryManager },
  { id: 'templates', label: 'Maler', icon: 'copy', group: 'content', Component: TemplatesManager },
  { id: 'reports', label: 'Rapporter', icon: 'chart', group: 'content', Component: ReportsManager },
  // Bare på Node-serveren (kontoer med e-postinnlogging).
  { id: 'team', label: 'Team', icon: 'users', group: 'account', Component: TeamManager, tenantOnly: true },
  { id: 'trash', label: 'Nylig slettet', icon: 'trash', group: 'account', Component: RecentlyDeletedManager }
];

// Gamle adresser som er slått sammen med andre sider.
const VIEW_ALIAS = { categories: 'schedule' };

const initialTab = () => {
  if (typeof window === 'undefined') return 'dashboard';
  const raw = new URLSearchParams(window.location.search).get('view');
  const v = VIEW_ALIAS[raw] || raw;
  return NAV.some((n) => n.id === v) ? v : 'dashboard';
};

const initials = (s = '') =>
  s
    .split(/[.\s@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?';

/** Lukker en popover ved klikk utenfor eller Escape. */
function useDismiss(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return ref;
}

// `context` kommer fra /api/context (Node-serveren). Mangler den, kjører vi
// som Worker uten e-postinnlogging, og admin vises som før.
export default function Admin({ context }) {
  if (context?.mode === 'tenant' && !context.signed_in) return <Login tenant={context.tenant} />;
  return <AdminShell context={context} />;
}

function AdminShell({ context }) {
  const [tab, setTab] = useState(initialTab);
  const [screenCount, setScreenCount] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [me, setMe] = useState(null);
  const [navKey, setNavKey] = useState(0);
  const [theme, setTheme] = useTheme(me);

  const tenant = context?.tenant ?? null;
  const nav = useMemo(() => NAV.filter((n) => !n.tenantOnly || tenant), [tenant]);
  const current = nav.find((n) => n.id === tab) ?? nav[0];

  useEffect(() => {
    document.title = tenant ? `${tenant.name} – Flatr` : 'Flatr';
    if (tenant) {
      try {
        localStorage.setItem('flatr.lastSlug', tenant.slug);
      } catch {
        /* ignore */
      }
    }
    api.me().then(setMe).catch(() => setMe(null));
  }, [tenant]);

  useEffect(() => {
    api.screens
      .list()
      .then((r) => setScreenCount(Array.isArray(r) ? r.length : null))
      .catch(() => setScreenCount(null));
  }, [tab, refreshKey]);

  const bump = () => setRefreshKey((k) => k + 1);
  const Active = current.Component;

  // Global tilstedeværelse – alle som er pålogget Flatr.
  const lobby = useCollab('lobby', { where: current.label });

  // `params` legges i adressen (f.eks. { edit: 3 } åpner spilleliste 3 i editoren).
  const go = (id, params = {}) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', id);
      url.searchParams.delete('edit');
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      window.history.replaceState(null, '', url);
    }
    setTab(id);
    setNavKey((k) => k + 1);
  };

  const logout = async () => {
    await api.auth.logout().catch(() => {});
    window.location.href = '/admin';
  };

  // Profilfargen vises for andre i editoren (markør og markering).
  const setColor = async (color) => {
    setMe((m) => m && { ...m, color, prefs: { ...m.prefs, color } });
    await api.prefs({ color }).catch(() => {});
  };

  const shared = { nav, tab, go, me, tenant, theme, setTheme, setColor, logout, lobby, screenCount, current };
  // navKey remonterer siden ved hver navigasjon, så den leser adressen på nytt.
  const content = <Active key={navKey} onChange={bump} onNavigate={go} me={me} theme={theme} />;

  return theme === 'presis' ? <RailShell {...shared}>{content}</RailShell> : <TopShell {...shared}>{content}</TopShell>;
}

/* ------------------------------ Presis ------------------------------ */

function RailShell({ nav, tab, go, me, tenant, theme, setTheme, setColor, logout, lobby, current, children }) {
  const mainItems = nav.filter((n) => n.group !== 'account');
  return (
    <div className="flex h-screen overflow-hidden bg-paper font-sans text-ink">
      <aside className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-line py-4">
        <LogoMark className="mb-4 h-6 w-6" />
        {mainItems.map((n, i) => {
          const active = n.id === tab;
          const divider = i > 0 && mainItems[i - 1].group !== n.group;
          return (
            <div key={n.id} className="flex flex-col items-center">
              {divider && <span className="my-2 h-px w-6 bg-line" aria-hidden="true" />}
              <button
                type="button"
                onClick={() => go(n.id)}
                title={n.label}
                aria-label={n.label}
                aria-current={active ? 'page' : undefined}
                className={`grid h-10 w-10 place-items-center rounded-lg transition-colors ${
                  active ? 'bg-brand-tint text-brand' : 'text-muted hover:bg-hair hover:text-ink'
                }`}
              >
                <Icon name={n.icon} className="h-5 w-5" />
              </button>
            </div>
          );
        })}
        <div className="mt-auto">
          <UserMenu
            me={me}
            nav={nav}
            go={go}
            theme={theme}
            setTheme={setTheme}
            setColor={setColor}
            logout={logout}
            tenant={tenant}
            placement="right"
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-6 text-[13px] text-muted">
          {tenant && (
            <>
              <span className="truncate">{tenant.name}</span>
              <span aria-hidden="true">/</span>
            </>
          )}
          <span className="font-medium text-ink">{current.label}</span>
          <div className="ml-auto">
            <OnlineBar peers={lobby.peers} selfId={lobby.selfId} connected={lobby.connected} />
          </div>
        </header>
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

/* ------------------------------- Varm ------------------------------- */

function TopShell({ nav, tab, go, me, tenant, theme, setTheme, setColor, logout, lobby, screenCount, children }) {
  const mainItems = nav.filter((n) => n.group === 'main');
  const contentItems = nav.filter((n) => n.group === 'content');
  const contentActive = contentItems.some((n) => n.id === tab);

  const pill = (active) =>
    `inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors ${
      active ? 'bg-brand-tint text-brand-dark' : 'text-muted hover:bg-zone hover:text-ink'
    }`;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper font-sans text-ink">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-card px-4 py-3 sm:px-6">
        <LogoLockup className="h-6 w-auto shrink-0 text-ink" />
        <nav className="ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {mainItems.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => go(n.id)}
              aria-current={n.id === tab ? 'page' : undefined}
              className={pill(n.id === tab)}
            >
              {n.label}
              {n.id === 'screens' && screenCount != null && (
                <span className="rounded-full bg-badge px-1.5 text-xs font-bold text-badge-ink">{screenCount}</span>
              )}
            </button>
          ))}
          <MenuButton label="Innhold" active={contentActive} className={pill(contentActive)}>
            {(close) =>
              contentItems.map((n) => (
                <MenuItem
                  key={n.id}
                  icon={n.icon}
                  active={n.id === tab}
                  onClick={() => {
                    go(n.id);
                    close();
                  }}
                >
                  {n.label}
                </MenuItem>
              ))
            }
          </MenuButton>
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden md:block">
            <OnlineBar peers={lobby.peers} selfId={lobby.selfId} connected={lobby.connected} />
          </div>
          <UserMenu
            me={me}
            nav={nav}
            go={go}
            theme={theme}
            setTheme={setTheme}
            setColor={setColor}
            logout={logout}
            tenant={tenant}
            placement="down"
            showTenant
          />
        </div>
      </header>
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}

/* ------------------------------- Felles ------------------------------ */

function MenuButton({ label, active, className, children }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={className}
      >
        {label}
        <Icon name="down" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 w-56 rounded-2xl border border-line bg-card p-1.5 shadow-pop"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, active, onClick, children }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
        active ? 'bg-brand-tint text-brand-dark' : 'text-ink hover:bg-zone'
      }`}
    >
      {icon && <Icon name={icon} className="h-4 w-4 shrink-0 text-muted" />}
      {children}
    </button>
  );
}

const ROLE_LABEL = { owner: 'Eier', editor: 'Redaktør' };

function UserMenu({ me, nav, go, theme, setTheme, setColor, logout, tenant, placement, showTenant }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  const accountItems = nav.filter((n) => n.group === 'account');
  const name = me?.name || 'Bruker';

  const popPos =
    placement === 'right' ? 'bottom-0 left-full ml-3' : 'right-0 top-full mt-2';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Brukermeny"
        className={`flex items-center gap-2 rounded-full transition-colors ${
          showTenant ? 'bg-zone py-1 pl-1 pr-3 hover:bg-hair' : ''
        }`}
      >
        <span
          className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white"
          style={{ background: me?.color || '#8b8d94' }}
          aria-hidden="true"
        >
          {initials(name)}
        </span>
        {showTenant && tenant && (
          <span className="hidden max-w-[10rem] truncate text-sm font-semibold sm:inline">{tenant.name}</span>
        )}
      </button>

      {open && (
        <div className={`absolute z-40 w-72 rounded-2xl border border-line bg-card p-3 shadow-pop ${popPos}`}>
          <div className="px-1 pb-3">
            <div className="truncate font-semibold">{name}</div>
            {me?.email && <div className="truncate text-xs text-muted">{me.email}</div>}
            {(tenant || me?.role) && (
              <div className="mt-1 truncate text-xs text-muted">
                {tenant?.name}
                {me?.role && ` · ${ROLE_LABEL[me.role] ?? me.role}`}
              </div>
            )}
          </div>

          <div className="border-t border-line px-1 py-3">
            <ThemePicker theme={theme} onChange={setTheme} />
          </div>

          {me?.palette && (
            <div className="border-t border-line px-1 py-3">
              <div className="mb-2 text-xs font-semibold text-muted">Din farge i editoren</div>
              <div className="flex flex-wrap gap-1.5">
                {me.palette.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Velg farge ${c}`}
                    aria-pressed={me.color === c}
                    className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                      me.color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-card' : ''
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-line pt-2">
            {accountItems.map((n) => (
              <MenuItem
                key={n.id}
                icon={n.icon}
                onClick={() => {
                  go(n.id);
                  setOpen(false);
                }}
              >
                {n.label}
              </MenuItem>
            ))}
            {tenant && (
              <MenuItem icon="logout" onClick={logout}>
                Logg ut
              </MenuItem>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
