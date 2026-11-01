// Oppstartsveiviser på Hjem – vises til minst én skjerm er koblet til og viser
// noe. Tre steg: velg hva skjermen skal vise, koble den til, ferdig.
// Første steg spør hva Flatr skal brukes til (industries.js): da lages en ferdig
// presentasjon, og appene som passer aktiveres hvis kunden lar dem stå på.
// «Noe annet» gir de vanlige valgene (egne presentasjoner, maler, blankt).

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { AddScreenForm } from './AddScreen.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import { MarketPreview } from './TemplatesManager.jsx';
import { Icon, Button, ErrorText } from './ui.jsx';
import { INDUSTRIES, EXAMPLE_POLL } from './industries.js';
import { OFFICIAL_BY_KEY } from '../../lib/appCatalog.js';
import { applyBrandToElements } from '../../lib/brand.js';
import { getBrand } from '../brandStore.js';
import AppIcon from './apps/AppIcon.jsx';
import { tr } from '../../lib/i18n.js';

const STEPS = [tr('Innhold'), tr('Koble til'), tr('Ferdig')];

function Steps({ step }) {
  return (
    <ol className="m-0 flex list-none items-center gap-2 p-0" aria-label={tr('Fremdrift')}>
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          {i > 0 && <span className={`h-px w-8 ${i <= step ? 'bg-brand' : 'bg-line'}`} aria-hidden="true" />}
          <span
            className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
              i < step ? 'bg-brand text-onbrand' : i === step ? 'border-2 border-brand text-brand' : 'border border-line text-muted'
            }`}
            aria-current={i === step ? 'step' : undefined}
          >
            {i < step ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={`hidden text-sm font-semibold sm:inline ${i === step ? 'text-ink' : 'text-muted'}`}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function Choice({ selected, onClick, children, title, sub }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col gap-2 rounded-2xl border bg-card p-2.5 text-left transition-shadow hover:shadow-card ${
        selected ? 'border-brand ring-2 ring-brand/30' : 'border-hair'
      }`}
    >
      {children}
      <span className="px-1 pb-1">
        <span className="block truncate text-sm font-bold text-ink">{title}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </button>
  );
}

function BlankPreview({ portrait }) {
  return (
    <div className="grid aspect-video place-items-center rounded border border-dashed border-line bg-zone">
      <div className={`grid place-items-center rounded border border-line bg-card text-muted ${portrait ? 'h-[70%] w-[22%]' : 'h-[55%] w-[55%]'}`}>
        <Icon name="plus" className="h-5 w-5" />
      </div>
    </div>
  );
}

/** Aktiverer en app (eller finner den hvis den alt er aktivert) og gir id-en. */
async function ensureApp(kind) {
  try {
    return (await api.apps.create({ kind })).id;
  } catch {
    return (await api.apps.list()).find((a) => a.kind === kind)?.id ?? null;
  }
}

export default function Onboarding({ greeting, orgName, playlists, onNavigate, onDone }) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('industry'); // industry | other
  const [industry, setIndustry] = useState(null);
  const [appsOn, setAppsOn] = useState(new Set());
  const [setup, setSetup] = useState([]); // apper som er aktivert og bør settes opp
  const [kits, setKits] = useState([]);
  const [choice, setChoice] = useState(null); // { type: 'kit'|'existing'|'blank', id?, orientation? }
  const [playlistId, setPlaylistId] = useState(null);
  const [screen, setScreen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.market
      .list({ kind: 'kit', sort: 'popular' })
      .then((r) => setKits((r || []).slice(0, 5)))
      .catch(() => {});
  }, []);

  const usable = playlists.filter((p) => p.slide_count > 0).slice(0, 3);

  const pickIndustry = (ind) => {
    setIndustry(ind);
    setAppsOn(new Set(ind.apps.map((a) => a.kind)));
  };

  // Lager bransjepresentasjonen: aktiverer valgte apper, så lysbildene.
  const createIndustry = async () => {
    setError('');
    setBusy(true);
    try {
      const ids = {};
      for (const kind of appsOn) ids[kind] = await ensureApp(kind);
      const poll = industry.id === 'event' && ids.poll ? (await api.polls.create(EXAMPLE_POLL).catch(() => null))?.id : null;
      const slides = industry.slides({ org: orgName || 'oss', app: (k) => ids[k] ?? null, poll });
      const pl = await api.playlists.create({ name: industry.title, orientation: 'landscape' });
      const seeded = (await api.deck.get(pl.id)) || [];
      const brand = getBrand();
      for (const s of slides) {
        const created = await api.deck.slide.create({ playlist_id: pl.id, name: s.name, background: s.background, elements: applyBrandToElements(s.elements, brand) });
        if (s.duration_seconds && s.duration_seconds !== 15) await api.deck.slide.update(created.id, { duration_seconds: s.duration_seconds });
      }
      for (const s of seeded) await api.deck.slide.remove(s.id).catch(() => {});
      await api.settings.update({ industry: industry.id }).catch(() => {});
      setSetup(Object.keys(ids).filter((k) => ids[k]));
      setPlaylistId(pl.id);
      setStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    setError('');
    setBusy(true);
    try {
      let id;
      if (choice.type === 'existing') id = choice.id;
      else if (choice.type === 'kit') id = (await api.market.install(choice.id)).playlist_id;
      else id = (await api.playlists.create({ name: tr('Min første presentasjon'), orientation: choice.orientation })).id;
      setPlaylistId(id);
      setStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const is = (type, id) => choice?.type === type && (choice.id ?? choice.orientation) === id;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 pb-12 pt-10 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 text-sm text-muted">{greeting}</p>
          <h1 className="m-0 mt-1 text-[2rem] font-extrabold leading-tight tracking-tight text-ink">{tr('La oss sette opp den første skjermen')}</h1>
        </div>
        <Steps step={step} />
      </div>

      <section className="rounded-3xl border border-line bg-card p-6 shadow-card sm:p-8">
        {step === 0 && mode === 'industry' && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="m-0 text-xl font-bold text-ink">{tr('Hva skal Flatr brukes til?')}</h2>
              <p className="m-0 mt-1 text-sm text-muted">{tr('Velg det som passer best, så lager vi en presentasjon du kan bygge videre på. Alt kan endres senere.')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {INDUSTRIES.map((ind) => (
                <button
                  key={ind.id}
                  type="button"
                  onClick={() => pickIndustry(ind)}
                  aria-pressed={industry?.id === ind.id}
                  className={`flex flex-col gap-1.5 rounded-2xl border bg-card p-4 text-left transition-shadow hover:shadow-card ${industry?.id === ind.id ? 'border-brand ring-2 ring-brand/30' : 'border-hair'}`}
                >
                  <Icon name={ind.icon} className="h-5 w-5 text-brand" />
                  <span className="text-sm font-bold text-ink">{ind.title}</span>
                  <span className="text-xs text-muted">{ind.text}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMode('other')}
                className="flex flex-col gap-1.5 rounded-2xl border border-dashed border-line bg-card p-4 text-left hover:shadow-card"
              >
                <Icon name="layers" className="h-5 w-5 text-muted" />
                <span className="text-sm font-bold text-ink">{tr('Noe annet')}</span>
                <span className="text-xs text-muted">{tr('Velg en mal, en av dine presentasjoner, eller start blankt.')}</span>
              </button>
            </div>

            {industry && (
              <div className="grid gap-4 rounded-2xl border border-hair bg-paper p-4 sm:grid-cols-2">
                <div>
                  <h3 className="m-0 text-sm font-bold text-ink">{tr('Dette lager vi')}</h3>
                  <ol className="m-0 mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
                    {industry.slides({ org: orgName || 'oss', app: (k) => (appsOn.has(k) ? 1 : null), poll: null }).map((s) => (
                      <li key={s.name}>{s.name}</li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h3 className="m-0 text-sm font-bold text-ink">{tr('Apper som passer')}</h3>
                  <p className="m-0 mt-1 text-xs text-muted">{tr('Appene aktiveres bare hvis du lar dem stå på.')}</p>
                  <div className="mt-2 space-y-2">
                    {industry.apps.map((a) => {
                      const def = OFFICIAL_BY_KEY[a.kind];
                      return (
                        <label key={a.kind} className="flex cursor-pointer items-start gap-3 rounded-xl border border-hair bg-card p-2.5">
                          <input
                            type="checkbox"
                            checked={appsOn.has(a.kind)}
                            onChange={(e) =>
                              setAppsOn((set) => {
                                const next = new Set(set);
                                if (e.target.checked) next.add(a.kind);
                                else next.delete(a.kind);
                                return next;
                              })
                            }
                            className="mt-1 h-4 w-4"
                          />
                          <AppIcon icon={def?.icon || 'sparkle'} color={def?.color || '#5b5bd6'} size={28} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-ink">{def?.name || a.kind}</span>
                            <span className="block text-xs text-muted">{a.why}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <ErrorText>{error}</ErrorText>
            <div className="flex items-center gap-2">
              <Button onClick={createIndustry} disabled={!industry || busy}>
                {busy ? tr('Lager presentasjonen …') : appsOn.size ? tr('Lag presentasjonen og aktiver {0}', [appsOn.size === 1 ? 'appen' : tr('{0} apper', [appsOn.size])]) : tr('Lag presentasjonen')}
              </Button>
              <button type="button" onClick={onDone} className="ml-auto text-sm font-semibold text-muted hover:text-ink">
                {tr('Hopp over veiviseren')}
              </button>
            </div>
          </div>
        )}

        {step === 0 && mode === 'other' && (
          <div className="flex flex-col gap-5">
            <button type="button" onClick={() => setMode('industry')} className="self-start text-sm font-semibold text-muted hover:text-ink">
              {tr('← Tilbake til bransjene')}
            </button>
            <div>
              <h2 className="m-0 text-xl font-bold text-ink">{tr('Hva skal skjermen vise?')}</h2>
              <p className="m-0 mt-1 text-sm text-muted">{tr('Start med en ferdig mal og bytt ut tekst og bilder, eller begynn helt blankt. Alt kan endres senere.')}</p>
            </div>

            {usable.length > 0 && (
              <div className="space-y-2">
                <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">{tr('Dine presentasjoner')}</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {usable.map((p) => (
                    <Choice key={p.id} selected={is('existing', p.id)} onClick={() => setChoice({ type: 'existing', id: p.id })} title={p.name} sub={`${p.slide_count} ${p.slide_count === 1 ? 'lysbilde' : 'lysbilder'}`}>
                      <LiveScreenView playlistId={p.id} orientation={p.orientation} />
                    </Choice>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">{tr('Ferdige maler')}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {kits.map((k) => (
                  <Choice key={k.id} selected={is('kit', k.id)} onClick={() => setChoice({ type: 'kit', id: k.id })} title={k.title} sub={k.description || tr('av {0}', [k.author || 'Flatr'])}>
                    <MarketPreview item={k} />
                  </Choice>
                ))}
                <Choice selected={is('blank', 'landscape')} onClick={() => setChoice({ type: 'blank', orientation: 'landscape' })} title={tr('Blank, liggende')} sub="16:9 – vanlig TV">
                  <BlankPreview />
                </Choice>
                <Choice selected={is('blank', 'portrait')} onClick={() => setChoice({ type: 'blank', orientation: 'portrait' })} title={tr('Blank, stående')} sub={tr('9:16 – TV på høykant')}>
                  <BlankPreview portrait />
                </Choice>
              </div>
            </div>

            <ErrorText>{error}</ErrorText>
            <div className="flex items-center gap-2">
              <Button onClick={next} disabled={!choice || busy}>
                {busy ? tr('Gjør klar …') : tr('Neste')}
              </Button>
              <button type="button" onClick={onDone} className="ml-auto text-sm font-semibold text-muted hover:text-ink">
                {tr('Hopp over veiviseren')}
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="m-0 text-xl font-bold text-ink">{tr('Koble til skjermen')}</h2>
              <p className="m-0 mt-1 text-sm text-muted">{tr('Har du en Apple TV, åpner du Flatr-appen og taster koden den viser. Andre skjermer får en lenke du åpner i nettleseren.')}</p>
            </div>
            <AddScreenForm playlistId={playlistId} onDone={(r) => (setScreen(r), setStep(2))} onCancel={() => setStep(0)} />
          </div>
        )}

        {step === 2 && screen && (
          <div className="grid items-center gap-6 md:grid-cols-[1fr_1.2fr]">
            <div className="flex flex-col gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-ok-tint text-ok">
                <Icon name="check" className="h-6 w-6" />
              </span>
              <h2 className="m-0 text-xl font-bold text-ink">«{screen.name}{tr('» er klar')}</h2>
              <p className="m-0 text-sm text-muted">
                {screen.mode === 'tv'
                  ? tr('Apple TV-en viser innholdet om noen sekunder. Endringer du gjør i presentasjonen vises på skjermen med en gang.')
                  : tr('Åpne lenken i nettleseren på skjermen. Du finner den igjen under Skjermer.')}
              </p>
              {screen.mode !== 'tv' && (
                <code className="truncate rounded-xl border border-line bg-paper px-3 py-2 text-sm">{`${window.location.origin}/display/${screen.screen_id}`}</code>
              )}
              {industry?.tips?.map((tip) => (
                <p key={tip} className="m-0 text-sm text-muted">
                  💡 {tip}
                </p>
              ))}
              {setup.length > 0 && (
                <div className="mt-1 rounded-xl border border-hair bg-paper p-3">
                  <div className="text-xs font-semibold text-muted">{tr('Sett opp appene, så får lysbildene innhold:')}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {setup.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => onNavigate('apps', { app: kind })}
                        className="rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-ink hover:border-brand"
                      >
                        {OFFICIAL_BY_KEY[kind]?.name || kind} →
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button onClick={() => onNavigate('playlists', { edit: playlistId })}>
                  <Icon name="edit" className="h-4 w-4" />
                  {tr('Rediger innholdet')}
                </Button>
                <Button variant="outline" onClick={onDone}>
                  {tr('Til oversikten')}
                </Button>
              </div>
            </div>
            <LiveScreenView screenId={screen.screen_id} />
          </div>
        )}
      </section>
    </div>
  );
}
