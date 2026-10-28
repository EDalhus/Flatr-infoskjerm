import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import AiCommand from './components/AiCommand.jsx';
import BrandManager from './components/BrandManager.jsx';
import ActivityManager from './components/ActivityManager.jsx';
import { setBrand } from './brandStore.js';
import { refreshApps, useAppKinds } from './appsStore.js';
import { Icon } from './components/ui.jsx';
import Dashboard from './components/Dashboard.jsx';
import ProgramManager from './components/ProgramManager.jsx';
import MediaLibraryManager from './components/MediaLibraryManager.jsx';
import TemplatesManager from './components/TemplatesManager.jsx';
import ScreensManager from './components/ScreensManager.jsx';
import PlaylistsManager from './components/PlaylistsManager.jsx';
import TimetableManager from './components/TimetableManager.jsx';
import ReportsManager from './components/ReportsManager.jsx';
import RecentlyDeletedManager from './components/RecentlyDeletedManager.jsx';
import TeamManager from './components/TeamManager.jsx';
import AppsManager from './components/AppsManager.jsx';
import AccountManager, { TwoFactorCard } from './components/AccountManager.jsx';
import Login from './Login.jsx';
import { useTheme } from './components/ThemePicker.jsx';
import OnlineBar from './components/OnlineBar.jsx';
import { LogoMark, LogoLockup } from './components/Logo.jsx';
import { useCollab } from '../hooks/useCollab.js';

// `group` styrer hvor punktet vises: i hovednavigasjonen ('main'), i
// Innhold-menyen ('content') eller i brukermenyen ('account').
const NAV = [
  { id: 'dashboard', label: 'Hjem', icon: 'home', group: 'main', Component: Dashboard },
  { id: 'screens', label: 'Skjermer', icon: 'monitor', group: 'main', Component: ScreensManager },
  { id: 'playlists', label: 'Presentasjoner', icon: 'layers', group: 'main', Component: PlaylistsManager },
  // Tidsplan og Program er Flatr Apps (requires): vises bare når appen er aktivert.
  { id: 'timetable', label: 'Tidsplan', icon: 'clock', group: 'main', Component: TimetableManager, requires: 'timetable' },
  { id: 'schedule', label: 'Program', icon: 'calendar', group: 'content', Component: ProgramManager, requires: 'events' },
  { id: 'media', label: 'Bibliotek', icon: 'image', group: 'content', Component: MediaLibraryManager },
  // Maler er en fane under Presentasjoner (?view=playlists&tab=templates).
  { id: 'templates', label: 'Maler', icon: 'copy', group: 'hidden', Component: TemplatesManager },
  { id: 'apps', label: 'Flatr Apps', icon: 'sparkle', group: 'content', Component: AppsManager },
  { id: 'reports', label: 'Rapporter', icon: 'chart', group: 'content', Component: ReportsManager },
  // Bare på Node-serveren (kontoer med e-postinnlogging).
  { id: 'brand', label: 'Merkevare', icon: 'tag', group: 'account', Component: BrandManager, tenantOnly: true },
  { id: 'account', label: 'Konto og sikkerhet', icon: 'lock', group: 'account', Component: AccountManager, tenantOnly: true },
  { id: 'team', label: 'Team', icon: 'users', group: 'account', Component: TeamManager, tenantOnly: true },
  { id: 'activity', label: 'Aktivitet', icon: 'clock', group: 'account', Component: ActivityManager, tenantOnly: true },
  { id: 'trash', label: 'Nylig slettet', icon: 'trash', group: 'account', Component: RecentlyDeletedManager }
];

// Gamle adresser som er slått sammen med andre sider.
const VIEW_ALIAS = { categories: 'schedule', sponsors: 'media', alerts: 'dashboard', pairing: 'screens', templates: 'playlists' };

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
  if (context?.mode === 'tenant' && !context.signed_in) return <Login tenant={context.tenant} account={context.account} />;
  if (context?.needs_2fa) return <Require2fa tenant={context.tenant} />;
  return <AdminShell context={context} />;
}

/** Kontoen krever tofaktor, og brukeren har det ikke ennå: sett det opp før noe annet. */
function Require2fa({ tenant }) {
  return (
    <div className="min-h-screen bg-paper px-4 py-16">
      <div className="mx-auto grid max-w-lg gap-5">
        <LogoLockup className="h-8" />
        <div>
          <h1 className="m-0 text-2xl font-bold text-ink">Slå på tofaktor</h1>
          <p className="m-0 mt-2 text-sm leading-relaxed text-muted">
            {tenant?.name || 'Kontoen'} krever tofaktor for alle i teamet. Det tar et minutt: skann en QR-kode med en autentiseringsapp (f.eks. Google Authenticator, 1Password eller Microsoft Authenticator) og skriv inn koden.
          </p>
        </div>
        <TwoFactorCard enabled={false} onChange={() => window.location.reload()} />
        <button
          type="button"
          onClick={async () => {
            await api.auth.logout().catch(() => {});
            window.location.href = '/admin';
          }}
          className="justify-self-start text-sm font-semibold text-muted hover:text-ink"
        >
          Logg ut
        </button>
      </div>
    </div>
  );
}

function AdminShell({ context }) {
  const [tab, setTab] = useState(initialTab);
  const [screenCount, setScreenCount] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [me, setMe] = useState(null);
  const [navKey, setNavKey] = useState(0);
  const [theme, setTheme] = useTheme(me);

  const tenant = context?.tenant ?? null;
  const appKinds = useAppKinds();
  useEffect(() => {
    refreshApps();
  }, []);
  // Sider fra apper vises når appen er aktivert (og mens listen lastes, så adressen ikke hopper).
  const nav = useMemo(() => NAV.filter((n) => (!n.tenantOnly || tenant) && (!n.requires || !appKinds || appKinds.has(n.requires))), [tenant, appKinds]);
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
    // Merkevaren brukes av editoren (fargesnarveier, standardskrift).
    api.settings
      .get()
      .then((s) => setBrand(s.brand || null))
      .catch(() => {});
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

  // `params` legges i adressen (f.eks. { edit: 3 } åpner presentasjon 3 i editoren).
  // Hvert sidebytte blir et steg i historikken, så Tilbake/Frem virker.
  const go = (id, params = {}) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.origin + window.location.pathname);
      url.searchParams.set('view', id);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      if (url.href !== window.location.href) window.history.pushState(null, '', url);
    }
    setTab(id);
    setNavKey((k) => k + 1);
  };

  // Tilbake/Frem: bytter side når ?view= endres. Endringer innenfor en side
  // (åpen presentasjon, app, skjerm) håndterer sidene selv (useUrlParam).
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    const onPop = () => {
      const next = initialTab();
      if (next !== tabRef.current) {
        setTab(next);
        setNavKey((k) => k + 1);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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

  return (
    <>
      <RailShell {...shared}>
        {me?.role === 'viewer' && (
          <div className="border-b border-line bg-zone px-6 py-2 text-center text-xs font-medium text-muted">Du har lesetilgang i {tenant?.name || 'kontoen'}: du kan se alt, men ikke endre noe.</div>
        )}
        {content}
      </RailShell>
      <AiCommand go={go} me={me} />
    </>
  );
}

/* ------------------------------ Presis ------------------------------ */

const NAV_WIDE_KEY = 'flatr.navWide';

function RailShell({ nav, tab, go, me, tenant, theme, setTheme, setColor, logout, lobby, current, children }) {
  const mainItems = nav.filter((n) => n.group !== 'account' && n.group !== 'hidden');
  // Sidemenyen er åpen (full bredde med navn) som standard; lukker du den,
  // huskes det i nettleseren til du åpner den igjen.
  const [wide, setWide] = useState(() => {
    try {
      return localStorage.getItem(NAV_WIDE_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const toggleWide = () =>
    setWide((w) => {
      try {
        localStorage.setItem(NAV_WIDE_KEY, w ? '0' : '1');
      } catch {
        /* privat modus e.l. */
      }
      return !w;
    });

  return (
    <div className="flex h-screen overflow-hidden bg-paper font-sans text-ink">
      <aside
        className={`flex shrink-0 flex-col gap-1 border-r border-line py-4 transition-[width] duration-200 ${
          wide ? 'w-56 px-3' : 'w-16 items-center'
        }`}
      >
        {/* Logo + pil som åpner/lukker menyen */}
        <div className={`mb-4 flex items-center ${wide ? 'h-9 justify-between pl-2' : 'flex-col gap-2'}`}>
          {wide ? <LogoLockup className="h-6 w-auto text-ink" /> : <LogoMark className="h-6 w-6" />}
          <button
            type="button"
            onClick={toggleWide}
            title={wide ? 'Lukk menyen' : 'Åpne menyen'}
            aria-label={wide ? 'Lukk menyen' : 'Åpne menyen'}
            aria-expanded={wide}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-hair hover:text-ink"
          >
            <Icon name="chevron" className={`h-4 w-4 transition-transform ${wide ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {mainItems.map((n, i) => {
          const active = n.id === tab;
          const divider = i > 0 && mainItems[i - 1].group !== n.group;
          return (
            <div key={n.id} className={`flex flex-col ${wide ? '' : 'items-center'}`}>
              {divider && <span className={`my-2 h-px bg-line ${wide ? 'mx-2' : 'w-6'}`} aria-hidden="true" />}
              <button
                type="button"
                onClick={() => go(n.id)}
                title={wide ? undefined : n.label}
                aria-label={n.label}
                aria-current={active ? 'page' : undefined}
                className={`flex h-10 items-center rounded-lg transition-colors ${
                  wide ? 'w-full gap-3 px-3 text-left text-sm font-medium' : 'w-10 justify-center'
                } ${active ? 'bg-brand-tint text-brand' : 'text-muted hover:bg-hair hover:text-ink'}`}
              >
                <Icon name={n.icon} className="h-5 w-5 shrink-0" />
                {wide && <span className="truncate">{n.label}</span>}
              </button>
            </div>
          );
        })}
        <div className={`mt-auto flex flex-col ${wide ? '' : 'items-center'}`}>
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
            expanded={wide}
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

function UserMenu({ me, nav, go, theme, setTheme, setColor, logout, tenant, placement, showTenant, expanded }) {
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
        className={`flex items-center gap-2 transition-colors ${
          expanded ? 'w-full rounded-lg p-1 text-left hover:bg-hair' : showTenant ? 'rounded-full bg-zone py-1 pl-1 pr-3 hover:bg-hair' : 'rounded-full'
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
        {expanded && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{name}</span>
            {tenant && <span className="block truncate text-xs text-muted">{tenant.name}</span>}
          </span>
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
