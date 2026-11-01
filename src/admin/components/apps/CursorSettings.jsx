import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import { Icon, Button } from '../ui.jsx';
import { Section, Dot } from './parts.jsx';
import { AddContext, ContextList } from '../AiContext.jsx';
import { tr } from '../../../lib/i18n.js';

// Innstillingene til Cursor AI: API-nøkkel fra Cursor (sjekkes og lagres
// kryptert), hvilken modell agenten skal bruke, og fast kontekst. Egen side
// (ikke felles med Claude), så hver leverandør kan endre seg for seg.

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

export default function CursorSettings({ app, onSaved }) {
  const [key, setKey] = useState('');
  const [editKey, setEditKey] = useState(!app.has_secret);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [models, setModels] = useState(null);
  const [context, setContext] = useState((app.config?.context || []).filter((i) => !i.archived));
  const onContext = async (assistant) => {
    setContext(assistant?.context || []);
    api.apps.get(app.id).then(onSaved).catch(() => {});
  };

  // Modellene kontoen har tilgang til (krever nøkkel).
  useEffect(() => {
    if (!app.has_secret) return;
    api.apps
      .models(app.id)
      .then(setModels)
      .catch((e) => setModels({ error: e.message }));
  }, [app.id, app.has_secret]);

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
    if (await update({ api_key: key.trim() }, tr('Nøkkelen virker og er lagret.'))) {
      setKey('');
      setEditKey(false);
    }
  };

  const chooseModel = (id) => {
    const m = Array.isArray(models) ? models.find((x) => x.id === id) : null;
    update({ config: { model: id || null, model_label: m?.name || null } }, 'Lagret.');
  };

  return (
    <div className="grid max-w-3xl gap-5">
      <Section
        icon="lock"
        title={tr('Cursor API-nøkkel')}
        hint={editKey ? tr('Lages på cursor.com → Dashboard → Integrations → API Keys. Steg-for-steg under «Om appen».') : null}
        action={
          !editKey && (
            <Button variant="ghost" size="sm" onClick={() => setEditKey(true)}>
              {tr('Bytt')}
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
              placeholder="key_…"
              autoComplete="off"
              className="h-10 rounded-xl border border-line bg-paper px-3 font-mono text-sm text-ink outline-none focus:border-focus"
              aria-label={tr('API-nøkkel')}
            />
            <Button type="submit" disabled={busy || !key.trim()}>
              {busy ? tr('Sjekker …') : tr('Lagre nøkkel')}
            </Button>
            {app.has_secret && (
              <button type="button" onClick={() => setEditKey(false)} className="justify-self-start text-xs font-semibold text-muted hover:text-ink">
                {tr('Avbryt')}
              </button>
            )}
          </form>
        ) : (
          <div className="flex items-center gap-2 px-5 pb-4 text-sm">
            <Dot tone="ok" />
            <span className="text-ink">{tr('Tilkoblet')}</span>
            <span className="font-mono text-muted">· {app.config?.key_hint || 'lagret'}</span>
            <button
              type="button"
              onClick={() => update({ api_key: null }, tr('Nøkkelen er fjernet.')).then((ok) => ok && setEditKey(true))}
              className="ml-auto text-xs font-semibold text-danger hover:underline"
            >
              {tr('Fjern')}
            </button>
          </div>
        )}
        {(error || notice) && <p className={`m-0 px-5 pb-4 text-sm ${error ? 'text-danger' : 'text-brand'} ${editKey ? '!px-0 !pb-0 pt-3' : ''}`}>{error || notice}</p>}
      </Section>

      <Section icon="sparkle" title={tr('Modell')} hint={tr('Hvilken modell Cursor-agenten bruker. «Cursors standard» følger det som er valgt i Cursor-kontoen.')}>
        {!app.has_secret ? (
          <p className="m-0 text-sm text-muted">{tr('Legg inn API-nøkkelen først.')}</p>
        ) : models === null ? (
          <p className="m-0 text-sm text-muted">{tr('Henter modeller …')}</p>
        ) : models.error ? (
          <p className="m-0 text-sm text-danger">{models.error}</p>
        ) : (
          <select
            value={app.config?.model || ''}
            onChange={(e) => chooseModel(e.target.value)}
            disabled={busy}
            className="h-10 w-full max-w-sm rounded-xl border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-focus"
            aria-label={tr('Modell')}
          >
            <option value="">{tr('Cursors standard')}</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </Section>

      <Section
        icon="layers"
        title={tr('Fast kontekst')}
        count={context.length}
        hint={tr('Dokumenter Cursor alltid følger når den lager presentasjoner – f.eks. merkevareretningslinjer, tone of voice eller fakta om bedriften. Nettsider og tekst leses; PDF-er kan Cursor ikke lese ennå.')}
      >
        <div className="grid gap-3">
          <ContextList agent="cursor" items={context} onChange={onContext} empty={tr('Ingen ennå. Legg til merkevareretningslinjene deres, så følger Cursor dem.')} />
          <AddContext agent="cursor" onChange={onContext} />
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/30 bg-brand-tint p-4 text-sm text-ink">
        <Icon name="sparkle" className="h-4 w-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          {tr('Trykk')} <kbd className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-xs">{MOD}{tr('K')}</kbd> {tr('hvor som helst i Flatr, eller åpne AI-fanen i editoren. Har du også Claude AI, velger du assistent der.')}
        </span>
        <Button size="sm" onClick={() => window.dispatchEvent(new CustomEvent('flatr:ai-open', { detail: { agent: 'cursor' } }))} disabled={!app.has_secret}>
          {tr('Prøv nå')}
        </Button>
      </div>
    </div>
  );
}
