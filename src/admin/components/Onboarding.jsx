// Oppstartsveiviser på Hjem – vises til minst én skjerm er koblet til og viser
// noe. Tre steg: velg hva skjermen skal vise, koble den til, ferdig.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { AddScreenForm } from './AddScreen.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import { MarketPreview } from './TemplatesManager.jsx';
import { Icon, Button, ErrorText } from './ui.jsx';

const STEPS = ['Innhold', 'Koble til', 'Ferdig'];

function Steps({ step }) {
  return (
    <ol className="m-0 flex list-none items-center gap-2 p-0" aria-label="Fremdrift">
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

export default function Onboarding({ greeting, playlists, onNavigate, onDone }) {
  const [step, setStep] = useState(0);
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

  const next = async () => {
    setError('');
    setBusy(true);
    try {
      let id;
      if (choice.type === 'existing') id = choice.id;
      else if (choice.type === 'kit') id = (await api.market.install(choice.id)).playlist_id;
      else id = (await api.playlists.create({ name: 'Min første presentasjon', orientation: choice.orientation })).id;
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
          <h1 className="m-0 mt-1 text-[2rem] font-extrabold leading-tight tracking-tight text-ink">La oss sette opp den første skjermen</h1>
        </div>
        <Steps step={step} />
      </div>

      <section className="rounded-3xl border border-line bg-card p-6 shadow-card sm:p-8">
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="m-0 text-xl font-bold text-ink">Hva skal skjermen vise?</h2>
              <p className="m-0 mt-1 text-sm text-muted">Start med en ferdig mal og bytt ut tekst og bilder, eller begynn helt blankt. Alt kan endres senere.</p>
            </div>

            {usable.length > 0 && (
              <div className="space-y-2">
                <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">Dine presentasjoner</h3>
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
              <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">Ferdige maler</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {kits.map((k) => (
                  <Choice key={k.id} selected={is('kit', k.id)} onClick={() => setChoice({ type: 'kit', id: k.id })} title={k.title} sub={k.description || `av ${k.author || 'Flatr'}`}>
                    <MarketPreview item={k} />
                  </Choice>
                ))}
                <Choice selected={is('blank', 'landscape')} onClick={() => setChoice({ type: 'blank', orientation: 'landscape' })} title="Blank, liggende" sub="16:9 – vanlig TV">
                  <BlankPreview />
                </Choice>
                <Choice selected={is('blank', 'portrait')} onClick={() => setChoice({ type: 'blank', orientation: 'portrait' })} title="Blank, stående" sub="9:16 – TV på høykant">
                  <BlankPreview portrait />
                </Choice>
              </div>
            </div>

            <ErrorText>{error}</ErrorText>
            <div className="flex items-center gap-2">
              <Button onClick={next} disabled={!choice || busy}>
                {busy ? 'Gjør klar …' : 'Neste'}
              </Button>
              <button type="button" onClick={onDone} className="ml-auto text-sm font-semibold text-muted hover:text-ink">
                Hopp over veiviseren
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="m-0 text-xl font-bold text-ink">Koble til skjermen</h2>
              <p className="m-0 mt-1 text-sm text-muted">Har du en Apple TV, åpner du Flatr-appen og taster koden den viser. Andre skjermer får en lenke du åpner i nettleseren.</p>
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
              <h2 className="m-0 text-xl font-bold text-ink">«{screen.name}» er klar</h2>
              <p className="m-0 text-sm text-muted">
                {screen.mode === 'tv'
                  ? 'Apple TV-en viser innholdet om noen sekunder. Endringer du gjør i presentasjonen vises på skjermen med en gang.'
                  : 'Åpne lenken i nettleseren på skjermen. Du finner den igjen under Skjermer.'}
              </p>
              {screen.mode !== 'tv' && (
                <code className="truncate rounded-xl border border-line bg-paper px-3 py-2 text-sm">{`${window.location.origin}/display/${screen.screen_id}`}</code>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button onClick={() => onNavigate('playlists', { edit: playlistId })}>
                  <Icon name="edit" className="h-4 w-4" />
                  Rediger innholdet
                </Button>
                <Button variant="outline" onClick={onDone}>
                  Til oversikten
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
