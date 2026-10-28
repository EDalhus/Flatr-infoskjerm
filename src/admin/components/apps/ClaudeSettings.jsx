import { useState } from 'react';
import { api } from '../../../lib/api.js';
import { Icon, Button, Segmented } from '../ui.jsx';
import { Section, Dot } from './parts.jsx';
import { AddContext, ContextList } from '../AiContext.jsx';

// Innstillingene til Claude AI: API-nøkkel fra Anthropic (sjekkes og lagres
// kryptert), hvor grundig Claude skal jobbe, og forbruket så langt.

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

const EFFORTS = [
  { value: 'low', label: 'Rask', hint: 'Raskest og billigst. Fint for små endringer.' },
  { value: 'medium', label: 'Balansert', hint: 'Anbefalt. Gode presentasjoner uten å bruke mye.' },
  { value: 'high', label: 'Grundig', hint: 'Tenker mer og planlegger bedre. Bruker mer av kreditten.' }
];

const k = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} mill.` : `${Math.round(n / 1000)}k`);

export default function ClaudeSettings({ app, onSaved }) {
  const [key, setKey] = useState('');
  const [editKey, setEditKey] = useState(!app.has_secret);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const effort = app.config?.effort || 'medium';
  const [context, setContext] = useState((app.config?.context || []).filter((i) => !i.archived));
  const onContext = async (assistant) => {
    setContext(assistant?.context || []);
    api.apps.get(app.id).then(onSaved).catch(() => {});
  };
  const usage = app.config?.usage;

  const update = async (body, done) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await api.apps.update(app.id, body);
      onSaved(saved);
      setNotice(done);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveKey = async (e) => {
    e.preventDefault();
    if (await update({ api_key: key.trim() }, 'Nøkkelen virker og er lagret.')) {
      setKey('');
      setEditKey(false);
    }
  };

  return (
    <div className="grid max-w-3xl gap-5">
      <Section
        icon="lock"
        title="Anthropic API-nøkkel"
        hint={editKey ? 'Lages på console.anthropic.com → API Keys. Steg-for-steg under «Om appen».' : null}
        action={
          !editKey && (
            <Button variant="ghost" size="sm" onClick={() => setEditKey(true)}>
              Bytt
            </Button>
          )
        }
        flush={!editKey}
      >
        {editKey ? (
          <form onSubmit={saveKey} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-…"
              autoComplete="off"
              className="h-10 rounded-xl border border-line bg-paper px-3 font-mono text-sm text-ink outline-none focus:border-focus"
              aria-label="API-nøkkel"
            />
            <Button type="submit" disabled={busy || !key.trim()}>
              {busy ? 'Sjekker …' : 'Lagre nøkkel'}
            </Button>
            {app.has_secret && (
              <button type="button" onClick={() => setEditKey(false)} className="justify-self-start text-xs font-semibold text-muted hover:text-ink">
                Avbryt
              </button>
            )}
          </form>
        ) : (
          <div className="flex items-center gap-2 px-5 pb-4 text-sm">
            <Dot tone="ok" />
            <span className="text-ink">Tilkoblet</span>
            <span className="font-mono text-muted">· {app.config?.key_hint || 'lagret'}</span>
            <button
              type="button"
              onClick={() => update({ api_key: null }, 'Nøkkelen er fjernet.').then((ok) => ok && setEditKey(true))}
              className="ml-auto text-xs font-semibold text-danger hover:underline"
            >
              Fjern
            </button>
          </div>
        )}
        {(error || notice) && <p className={`m-0 px-5 pb-4 text-sm ${error ? 'text-danger' : 'text-brand'} ${editKey ? '!px-0 !pb-0 pt-3' : ''}`}>{error || notice}</p>}
      </Section>

      <Section
        icon="layers"
        title="Fast kontekst"
        count={context.length}
        hint="Dokumenter Claude alltid følger når den lager presentasjoner – f.eks. merkevareretningslinjer, designmanual, tone of voice eller fakta om bedriften. Lenke (nettside eller PDF), opplastet PDF eller tekst."
      >
        <div className="grid gap-3">
          <ContextList items={context} onChange={onContext} empty="Ingen ennå. Legg til merkevareretningslinjene deres, så følger Claude dem til punkt og prikke." />
          <AddContext onChange={onContext} />
        </div>
      </Section>

      <Section icon="sparkle" title="Hvor grundig skal Claude jobbe?" hint={EFFORTS.find((e) => e.value === effort)?.hint}>
        <Segmented value={effort} onChange={(v) => update({ config: { effort: v } }, 'Lagret.')} options={EFFORTS.map(({ value, label }) => ({ value, label }))} />
      </Section>

      <Section icon="chart" title="Forbruk" hint="Tokens brukt med denne nøkkelen fra Flatr. Prisen ser du i Anthropic Console.">
        {usage ? (
          <dl className="m-0 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Inn</dt>
              <dd className="m-0 font-semibold tabular-nums text-ink">{k(usage.input + usage.cache_write)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Fra mellomlager</dt>
              <dd className="m-0 font-semibold tabular-nums text-ink">{k(usage.cache_read)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Ut</dt>
              <dd className="m-0 font-semibold tabular-nums text-ink">{k(usage.output)}</dd>
            </div>
            <p className="col-span-full m-0 text-xs text-muted">Siden {new Date(usage.since).toLocaleDateString('nb-NO')}</p>
          </dl>
        ) : (
          <p className="m-0 text-sm text-muted">Ingen bruk ennå.</p>
        )}
      </Section>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/30 bg-brand-tint p-4 text-sm text-ink">
        <Icon name="sparkle" className="h-4 w-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          Trykk <kbd className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-xs">{MOD}K</kbd> hvor som helst i Flatr, eller åpne AI-fanen i editoren.
        </span>
        <Button size="sm" onClick={() => window.dispatchEvent(new CustomEvent('flatr:ai-open'))} disabled={!app.has_secret}>
          Prøv nå
        </Button>
      </div>
    </div>
  );
}
