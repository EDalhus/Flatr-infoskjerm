import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { refreshApps } from '../appsStore.js';
import { OFFICIAL_APPS, CATEGORIES, CATEGORY_LABEL, TEMPLATES } from '../../lib/appCatalog.js';
import AppIcon from './apps/AppIcon.jsx';
import { useUrlParam } from '../useUrlParam.js';
import AisSettings from './apps/AisSettings.jsx';
import CustomSettings from './apps/CustomSettings.jsx';
import BirthdaySettings from './apps/BirthdaySettings.jsx';
import ClaudeSettings from './apps/ClaudeSettings.jsx';
import AisCalls from './apps/AisCalls.jsx';
import UnsplashSettings from './apps/UnsplashSettings.jsx';
import MenuSettings from './apps/MenuSettings.jsx';
import TidesSettings from './apps/TidesSettings.jsx';
import FootballSettings from './apps/FootballSettings.jsx';
import AppBuilder from './apps/AppBuilder.jsx';
import IconEditor from './apps/IconEditor.jsx';
import { Icon, Input, Button, Card, PageHeader, ErrorText, Segmented } from './ui.jsx';

// Flatr Apps – markedsplassen. Offisielle apper (bygd inn i Flatr) og egne
// apper (laget i appbyggeren, delt etter godkjenning) aktiveres her før de kan
// brukes i editoren. Adressen holder tilstanden: ?view=apps&tab=…&app=…&build=…

const TABS = [
  { value: 'explore', label: 'Utforsk' },
  { value: 'mine', label: 'Mine apper' },
  { value: 'dev', label: 'Utvikler' }
];
const REVIEW = {
  none: { label: 'Privat', tone: 'bg-zone text-muted' },
  pending: { label: 'Venter på godkjenning', tone: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Godkjent', tone: 'bg-brand-tint text-brand' },
  rejected: { label: 'Avvist', tone: 'bg-danger-tint text-danger' }
};

const officialItem = (a, icons, canEdit) => ({ ...a, id: a.key, kind: a.key, publisher: 'Flatr', verified: true, image: icons?.[a.key] || null, can_edit_icon: canEdit, iconKey: `official:${a.key}` });
const customItem = (a) => ({
  ...a,
  id: `c${a.id}`,
  ref: a.id,
  kind: 'custom',
  iconKey: `custom:${a.id}`,
  publisher: a.author || 'Ukjent',
  verified: false,
  views: [TEMPLATES.find((t) => t.id === a.display?.template)?.label].filter(Boolean)
});

// Fane, åpen app og appbyggeren bor i adressen, så Tilbake/Frem virker.
const useParam = useUrlParam;

function Badge({ children, tone = 'bg-zone text-muted' }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{children}</span>;
}

function AppCard({ item, installed, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-hair bg-card p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop"
    >
      <div className="flex items-start justify-between gap-2">
        <AppIcon icon={item.icon} color={item.color} size={56} image={item.image} />
        <div className="flex flex-wrap justify-end gap-1">
          {installed && (
            <Badge tone="bg-brand-tint text-brand">
              <Icon name="check" className="h-3 w-3" />
              Aktivert
            </Badge>
          )}
          {item.own && item.review_status && <Badge tone={REVIEW[item.review_status]?.tone}>{REVIEW[item.review_status]?.label}</Badge>}
        </div>
      </div>
      <div className="min-w-0">
        <div className="line-clamp-2 text-lg font-bold leading-snug text-ink group-hover:text-brand">{item.name}</div>
        <div className="mt-1 flex items-center gap-1 text-sm text-muted">
          {item.publisher}
          {item.verified && (
            <span title="Offisiell app fra Flatr" className="grid h-4 w-4 place-items-center rounded-full bg-brand text-onbrand">
              <Icon name="check" className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      </div>
      <p className="m-0 line-clamp-2 text-sm text-muted">{item.tagline}</p>
      <div className="mt-auto pt-1 text-xs font-medium text-muted">{CATEGORY_LABEL[item.category] || 'Annet'}</div>
    </button>
  );
}

export default function AppsManager() {
  const [installs, setInstalls] = useState(null);
  const [custom, setCustom] = useState([]);
  const [officialIcons, setOfficialIcons] = useState({});
  const [canEditOfficial, setCanEditOfficial] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useParam('tab');
  const [openId, setOpenId] = useParam('app');
  const [build, setBuild] = useParam('build');
  const [detailTab, setDetailTab] = useState('setup');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([api.apps.list(), api.appMarket.list()])
      .then(([ins, cus]) => {
        setInstalls(ins || []);
        setCustom(cus?.apps || []);
        setOfficialIcons(cus?.official_icons || {});
        setCanEditOfficial(!!cus?.can_edit_official);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  // Ny app åpnet: start på oppsettet.
  useEffect(() => {
    setDetailTab('setup');
    setIconOpen(false);
  }, [openId]);

  // Nytt ikon: oppdater katalogen uten å laste alt på nytt.
  const iconChanged = (item, image) => {
    if (item.kind === 'custom') setCustom((list) => list.map((a) => (a.id === item.ref ? { ...a, image } : a)));
    else setOfficialIcons((m) => ({ ...m, [item.kind]: image }));
  };

  const catalog = useMemo(
    () => [...OFFICIAL_APPS.map((a) => officialItem(a, officialIcons, canEditOfficial)), ...custom.map(customItem)],
    [custom, officialIcons, canEditOfficial]
  );
  const installOf = (item) => (installs || []).find((i) => i.kind === item.kind && (item.kind !== 'custom' || i.app_ref === item.ref));
  const current = catalog.find((c) => c.id === openId);
  const activeTab = tab || 'explore';

  const activate = async (item) => {
    setError('');
    setBusy(true);
    try {
      await api.apps.create({ kind: item.kind, app_ref: item.ref });
      await load();
      refreshApps();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const deactivate = async (item) => {
    const ins = installOf(item);
    if (!ins || !confirm(`Deaktivere «${item.name}»? Innstillingene slettes, og elementer som bruker appen slutter å vise data.`)) return;
    setError('');
    try {
      await api.apps.remove(ins.id);
      await load();
      refreshApps();
    } catch (e) {
      setError(e.message);
    }
  };
  const removeCustom = async (item) => {
    if (!confirm(`Fjerne «${item.name}» fra markedsplassen? Kunder som allerede har aktivert den kan fortsatt bruke den.`)) return;
    try {
      await api.appMarket.remove(item.ref);
      setOpenId('');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  /* ------------------------------ appbyggeren ------------------------------ */
  // Vent på katalogen, så skjemaet starter med appen som redigeres.
  if (build && !installs) return null;
  if (build) {
    const editing = build === 'new' ? null : custom.find((a) => String(a.id) === build && a.own);
    return (
      <>
        <PageHeader
          eyebrow={
            <button type="button" onClick={() => setBuild('')} className="inline-flex items-center gap-1 hover:text-ink">
              <Icon name="back" className="h-3.5 w-3.5" />
              Flatr Apps
            </button>
          }
          title={editing ? `Rediger ${editing.name}` : 'Lag en app'}
          subtitle="Koble et JSON-API til skjermene uten å skrive kode."
        />
        <div className="mx-auto w-full max-w-6xl px-6 pb-12 pt-4 sm:px-8">
          {build !== 'new' && !editing ? (
            <ErrorText>Finner ikke appen.</ErrorText>
          ) : (
            <AppBuilder
              key={build}
              app={editing}
              onDone={async (saved) => {
                await load();
                setBuild('', { replace: true });
                setTab('dev', { replace: true });
                setOpenId(`c${saved.id}`, { replace: true });
              }}
            />
          )}
        </div>
      </>
    );
  }

  /* ------------------------------ detaljside ------------------------------- */
  if (current) {
    const ins = installOf(current);
    const hasSettings = ['ais', 'custom', 'birthdays', 'claude', 'unsplash', 'menu', 'tides', 'football'].includes(current.kind);
    // NAIS har tillegget «Anløp» som egen fane.
    const extraTabs = current.kind === 'ais' && ins ? [['calls', 'Anløp']] : [];
    const view = !ins || !hasSettings ? 'about' : detailTab === 'about' ? 'about' : extraTabs.some(([id]) => id === detailTab) ? detailTab : 'setup';
    const onSaved = (a) => setInstalls((l) => l.map((x) => (x.id === a.id ? a : x)));
    const host = (() => {
      try {
        return new URL(current.source.url.replace(/\{\{[^}]*\}\}/g, 'x')).hostname;
      } catch {
        return null;
      }
    })();

    return (
      <div className="mx-auto w-full max-w-7xl px-6 pb-24 pt-5 sm:px-8">
        <button type="button" onClick={() => setOpenId('')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <Icon name="back" className="h-3.5 w-3.5" />
          Flatr Apps
        </button>

        {/* topp: ikon, navn, status */}
        <header className="mt-4 flex flex-wrap items-center gap-4">
          {current.can_edit_icon ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIconOpen(!iconOpen)}
                className="group relative block rounded-2xl focus:outline-none focus:ring-2 focus:ring-focus/40"
                title="Endre ikon"
              >
                <AppIcon icon={current.icon} color={current.color} size={56} image={current.image} />
                <span className="absolute inset-0 grid place-items-center rounded-[14px] bg-black/55 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Endre
                </span>
              </button>
              {iconOpen && <IconEditor appKey={current.iconKey} item={current} onChange={(img) => iconChanged(current, img)} onClose={() => setIconOpen(false)} />}
            </div>
          ) : (
            <AppIcon icon={current.icon} color={current.color} size={56} image={current.image} />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="m-0 flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-ink">
              {current.name}
              {ins && (
                <Badge tone="bg-brand-tint text-brand">
                  <Icon name="check" className="h-3 w-3" />
                  Aktivert
                </Badge>
              )}
              {current.own && <Badge tone={REVIEW[current.review_status]?.tone}>{REVIEW[current.review_status]?.label}</Badge>}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
              {current.publisher}
              {current.verified && (
                <span title="Offisiell app fra Flatr" className="grid h-4 w-4 place-items-center rounded-full bg-brand text-onbrand">
                  <Icon name="check" className="h-2.5 w-2.5" />
                </span>
              )}
              <span>·</span>
              <span>{CATEGORY_LABEL[current.category] || 'Annet'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {current.own && (
              <Button variant="ghost" size="sm" onClick={() => setBuild(String(current.ref))}>
                <Icon name="edit" className="h-4 w-4" />
                Rediger
              </Button>
            )}
            {ins ? (
              <Button variant="ghost" size="sm" onClick={() => deactivate(current)} className="!text-muted hover:!text-danger">
                Deaktiver
              </Button>
            ) : (
              <Button onClick={() => activate(current)} disabled={busy}>
                <Icon name="plus" className="h-4 w-4" />
                {busy ? 'Aktiverer …' : 'Aktiver'}
              </Button>
            )}
          </div>
        </header>

        {ins && hasSettings && (
          <div className="mt-5 border-b border-hair">
            <nav className="-mb-px flex gap-5" aria-label="Faner">
              {[
                ['setup', 'Oppsett'],
                ...extraTabs,
                ['about', 'Om appen']
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDetailTab(id)}
                  className={`border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
                    view === id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        )}

        <div className="mt-6">
          <ErrorText>{error}</ErrorText>

          {view === 'setup' && current.kind === 'ais' && <AisSettings app={ins} onSaved={onSaved} />}
          {view === 'calls' && current.kind === 'ais' && <AisCalls app={ins} onSaved={onSaved} />}
          {view === 'setup' && current.kind === 'unsplash' && <UnsplashSettings app={ins} onSaved={onSaved} />}
          {view === 'setup' && current.kind === 'menu' && <MenuSettings app={ins} onSaved={onSaved} />}
          {view === 'setup' && current.kind === 'tides' && <TidesSettings app={ins} onSaved={onSaved} />}
          {view === 'setup' && current.kind === 'football' && <FootballSettings app={ins} onSaved={onSaved} />}
          {view === 'setup' && current.kind === 'custom' && <CustomSettings app={ins} onSaved={onSaved} />}
          {view === 'setup' && current.kind === 'birthdays' && <BirthdaySettings app={ins} onSaved={onSaved} />}
          {view === 'setup' && current.kind === 'claude' && <ClaudeSettings app={ins} onSaved={onSaved} />}

          {view === 'about' && (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <p className="m-0 text-lg leading-relaxed text-ink">{current.tagline}</p>
                {current.description && current.description !== current.tagline && (
                  <p className="m-0 mt-4 whitespace-pre-line leading-relaxed text-muted">{current.description}</p>
                )}
                {ins && !hasSettings && (
                  <div className="mt-6 flex items-start gap-3 rounded-2xl border border-brand/30 bg-brand-tint p-4 text-sm text-ink">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <span>
                      {current.ready || (
                        <>
                          Klar til bruk. Åpne en presentasjon og legg den til fra <strong>Widgeter</strong> i editoren.
                        </>
                      )}
                    </span>
                  </div>
                )}
                {!ins && (
                  <Button className="mt-6" onClick={() => activate(current)} disabled={busy}>
                    <Icon name="plus" className="h-4 w-4" />
                    {busy ? 'Aktiverer …' : `Aktiver ${current.name}`}
                  </Button>
                )}
                {current.guide && (
                  <section className="mt-10">
                    <h2 className="m-0 text-lg font-bold text-ink">{current.guide.title}</h2>
                    {current.guide.intro && <p className="m-0 mt-2 text-sm leading-relaxed text-muted">{current.guide.intro}</p>}
                    <ol className="m-0 mt-5 grid list-none gap-0 p-0">
                      {current.guide.steps.map((st, i) => (
                        <li key={st.title} className="relative flex gap-4 pb-6 last:pb-0">
                          {i < current.guide.steps.length - 1 && <span className="absolute left-[15px] top-9 bottom-0 w-px bg-line" aria-hidden="true" />}
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-tint text-sm font-bold text-brand">{i + 1}</span>
                          <div className="min-w-0 pt-1">
                            <h3 className="m-0 text-sm font-semibold text-ink">{st.title}</h3>
                            <p className="m-0 mt-1 text-sm leading-relaxed text-muted">{st.body}</p>
                            {st.link && (
                              <a href={st.link.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                                {st.link.label}
                                <Icon name="external" className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                    {current.guide.troubleshooting && (
                      <div className="mt-6 rounded-xl border border-line bg-zone/50 p-4 text-sm">
                        <div className="font-semibold text-ink">Fungerer det ikke?</div>
                        <p className="m-0 mt-1 leading-relaxed text-muted">{current.guide.troubleshooting}</p>
                      </div>
                    )}
                  </section>
                )}
                {current.own && current.review_status === 'rejected' && current.review_note && (
                  <p className="m-0 mt-6 rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">Avvist av Flatr: {current.review_note}</p>
                )}
              </div>
              <aside className="min-w-0">
                <dl className="m-0 grid gap-5 rounded-2xl border border-hair bg-card p-5 text-sm">
                  {current.views?.length > 0 && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Visninger</dt>
                      <dd className="m-0 mt-2 grid gap-1.5">
                        {current.views.map((v) => (
                          <span key={v} className="flex items-center gap-2 text-ink">
                            <Icon name="check" className="h-3.5 w-3.5 text-brand" />
                            {v}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  {current.requires && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Krever</dt>
                      <dd className="m-0 mt-1.5 text-ink">{current.requires}</dd>
                    </div>
                  )}
                  {current.kind === 'custom' && current.settings?.length > 0 && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Du fyller inn</dt>
                      <dd className="m-0 mt-1.5 text-ink">{current.settings.map((x) => x.label).join(', ')}</dd>
                    </div>
                  )}
                  {current.kind === 'custom' && host && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Henter data fra</dt>
                      <dd className="m-0 mt-1.5 break-all text-ink">{host}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Utgiver</dt>
                    <dd className="m-0 mt-1.5 text-ink">{current.publisher}</dd>
                  </div>
                  {current.own && (
                    <div className="border-t border-hair pt-4">
                      <button type="button" onClick={() => removeCustom(current)} className="text-sm font-medium text-danger hover:underline">
                        Fjern fra markedsplassen
                      </button>
                    </div>
                  )}
                </dl>
              </aside>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------ katalogen ------------------------------- */
  const needle = q.trim().toLowerCase();
  let shown = catalog;
  if (activeTab === 'mine') shown = catalog.filter((c) => installOf(c));
  if (activeTab === 'dev') shown = catalog.filter((c) => c.own);
  if (activeTab === 'explore') shown = catalog.filter((c) => !c.own || c.review_status === 'approved' || installOf(c));
  if (cat) shown = shown.filter((c) => c.category === cat);
  if (needle) shown = shown.filter((c) => `${c.name} ${c.tagline} ${c.publisher}`.toLowerCase().includes(needle));

  return (
    <>
      <PageHeader
        title="Flatr Apps"
        subtitle="Aktiver apper for å bruke dem på skjermene – eller lag din egen."
        action={
          <Button onClick={() => setBuild('new')}>
            <Icon name="plus" className="h-4 w-4" />
            Lag app
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-5 px-6 pb-12 pt-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={activeTab} onChange={(v) => setTab(v === 'explore' ? '' : v)} options={TABS} />
          <div className="relative ml-auto w-full sm:w-72">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk i apper" className="!pl-9" aria-label="Søk i apper" />
          </div>
        </div>

        <ErrorText>{error}</ErrorText>

        <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Kategorier">
            {[{ id: '', label: 'Alle kategorier' }, ...CATEGORIES].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm ${cat === c.id ? 'bg-brand-tint font-semibold text-brand' : 'text-muted hover:bg-zone hover:text-ink'}`}
              >
                {c.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0">
            {activeTab === 'dev' && (
              <Card>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-ink">Lag din egen app</div>
                    <p className="m-0 mt-1 text-sm text-muted">
                      Koble et JSON-API til skjermene uten kode. Appen er privat for kontoen din, og kan sendes til godkjenning for å bli tilgjengelig for alle
                      Flatr-kunder.
                    </p>
                  </div>
                  <Button onClick={() => setBuild('new')}>
                    <Icon name="plus" className="h-4 w-4" />
                    Lag app
                  </Button>
                </div>
              </Card>
            )}
            {installs && shown.length === 0 && (
              <p className="m-0 py-12 text-center text-sm text-muted">
                {activeTab === 'mine' ? 'Du har ikke aktivert noen apper ennå. Finn dem under Utforsk.' : activeTab === 'dev' ? '' : 'Ingen apper passer søket.'}
              </p>
            )}
            <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${activeTab === 'dev' ? 'mt-4' : ''}`}>
              {shown.map((item) => (
                <AppCard key={item.id} item={item} installed={!!installOf(item)} onOpen={() => setOpenId(item.id)} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
