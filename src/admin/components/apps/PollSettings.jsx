import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import { Button, Input, Segmented } from '../ui.jsx';
import { Section } from './parts.jsx';
import { tr } from '../../../lib/i18n.js';

// Avstemning: lag avstemninger og «spørsmål fra salen», styr dem underveis
// (åpne/lukke, vise resultater, nullstille) og godkjenn spørsmål. Lista
// oppdateres hvert fjerde sekund mens siden er åpen, så du ser stemmene komme.

function NewPoll({ onCreated }) {
  const [kind, setKind] = useState('choice');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [showResults, setShowResults] = useState(true);
  const [moderate, setModerate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.polls.create({ kind, question, options: options.filter((o) => o.trim()), show_results: showResults, moderate });
      setQuestion('');
      setOptions(['', '']);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={create} className="grid gap-3">
      <Segmented value={kind} onChange={setKind} options={[{ value: 'choice', label: tr('Flervalg') }, { value: 'questions', label: tr('Spørsmål fra salen') }]} />
      <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={kind === 'choice' ? tr('Spørsmålet, f.eks. «Hva vil du ha til lunsj fredag?»') : tr('Overskrift, f.eks. «Spørsmål til styret»')} maxLength={200} />
      {kind === 'choice' && (
        <div className="grid gap-2">
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input value={o} onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? e.target.value : x)))} placeholder={tr('Svar {0}', [i + 1])} maxLength={80} />
              {options.length > 2 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}>
                  {tr('Fjern')}
                </Button>
              )}
            </div>
          ))}
          {options.length < 8 && (
            <button type="button" onClick={() => setOptions((list) => [...list, ''])} className="justify-self-start text-sm font-semibold text-brand hover:underline">
              {tr('+ Legg til svar')}
            </button>
          )}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-ink">
        {kind === 'choice' ? (
          <>
            <input type="checkbox" checked={showResults} onChange={(e) => setShowResults(e.target.checked)} className="h-4 w-4" />
            {tr('Vis resultatene mens folk stemmer')}
          </>
        ) : (
          <>
            <input type="checkbox" checked={moderate} onChange={(e) => setModerate(e.target.checked)} className="h-4 w-4" />
            {tr('Godkjenn spørsmål før de vises')}
          </>
        )}
      </label>
      {error && <p className="m-0 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={busy || !question.trim()} className="justify-self-start">
        {busy ? tr('Lager …') : tr('Lag avstemning')}
      </Button>
    </form>
  );
}

function PollCard({ poll, origin, onChange }) {
  const [error, setError] = useState('');
  const update = async (patch) => {
    setError('');
    try {
      await api.polls.update(poll.id, patch);
      onChange();
    } catch (e) {
      setError(e.message);
    }
  };
  const url = `${origin}${poll.path}`;
  const open = poll.status === 'open';
  const max = Math.max(1, ...(poll.counts || [0]));
  return (
    <section className="rounded-2xl border border-hair bg-card p-5">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-muted">
            {poll.kind === 'choice' ? tr('Flervalg') : tr('Spørsmål fra salen')} · <span className={open ? 'text-brand' : ''}>{open ? tr('Åpen') : tr('Lukket')}</span> ·{' '}
            {poll.kind === 'choice' ? tr('{0} stemmer', [poll.total]) : tr('{0} spørsmål', [poll.total])}
          </div>
          <h3 className="m-0 mt-1 text-base font-bold text-ink">{poll.question}</h3>
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-ink">
            {url.replace(/^https?:\/\//, '')}
          </a>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => update({ status: open ? 'closed' : 'open' })}>
            {open ? tr('Lukk') : tr('Åpne igjen')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => confirm(tr('Nullstille? Alle stemmer og spørsmål slettes.')) && update({ reset: true })}>
            {tr('Nullstill')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (!confirm(tr('Slette avstemningen?'))) return;
              await api.polls.remove(poll.id).catch((e) => setError(e.message));
              onChange();
            }}
          >
            {tr('Slett')}
          </Button>
        </div>
      </div>

      {poll.kind === 'choice' ? (
        <div className="mt-4 grid gap-2">
          {poll.options.map((o, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-3 text-sm">
              <span className="truncate text-ink">{o}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-zone">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((poll.counts?.[i] || 0) / max) * 100}%` }} />
              </div>
              <span className="text-right tabular-nums text-muted">{poll.counts?.[i] || 0}</span>
            </div>
          ))}
          <label className="mt-1 flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={poll.show_results} onChange={(e) => update({ show_results: e.target.checked })} className="h-4 w-4" />
            {tr('Vis resultatene på skjermen og mobilen mens den er åpen')}
          </label>
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={poll.moderate} onChange={(e) => update({ moderate: e.target.checked })} className="h-4 w-4" />
            {tr('Godkjenn spørsmål før de vises')}
          </label>
          {(poll.questions || []).map((q) => (
            <div key={q.id} className={`flex items-start gap-3 rounded-xl px-3 py-2 text-sm ${q.status === 'pending' ? 'bg-warn/10' : q.status === 'hidden' ? 'bg-zone opacity-60' : 'bg-zone'}`}>
              <span className="min-w-0 flex-1 text-ink">{q.text}</span>
              <span className="shrink-0 tabular-nums text-muted">♥ {q.likes}</span>
              {q.status === 'shown' ? (
                <button type="button" onClick={() => api.polls.moderate(poll.id, q.id, 'hidden').then(onChange)} className="shrink-0 text-xs font-semibold text-muted hover:text-ink">
                  {tr('Skjul')}
                </button>
              ) : (
                <button type="button" onClick={() => api.polls.moderate(poll.id, q.id, 'shown').then(onChange)} className="shrink-0 text-xs font-semibold text-brand hover:underline">
                  {q.status === 'pending' ? tr('Godkjenn') : tr('Vis')}
                </button>
              )}
            </div>
          ))}
          {!(poll.questions || []).length && <p className="m-0 text-sm text-muted">{tr('Ingen spørsmål ennå.')}</p>}
        </div>
      )}
      {error && <p className="m-0 mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

export default function PollSettings() {
  const [data, setData] = useState(null);
  const load = () =>
    api.polls
      .list()
      .then(setData)
      .catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <Section icon="plus" title={tr('Ny avstemning')} hint={tr('Vis den på en skjerm med Widgeter → Avstemning. Publikum skanner QR-koden og svarer fra mobilen.')}>
          <NewPoll onCreated={load} />
        </Section>
      </div>
      <div className="min-w-0 space-y-4">
        {data?.polls?.map((p) => <PollCard key={p.id} poll={p} origin={data.origin || window.location.origin} onChange={load} />)}
        {data && !data.polls?.length && <p className="m-0 text-sm text-muted">{tr('Ingen avstemninger ennå.')}</p>}
      </div>
    </div>
  );
}
