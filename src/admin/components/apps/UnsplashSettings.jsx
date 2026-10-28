import { useState } from 'react';
import { api } from '../../../lib/api.js';
import { Button } from '../ui.jsx';
import { Section, Dot } from './parts.jsx';

// Innstillingene til Unsplash bildebank: kontoens egen Access Key.

export default function UnsplashSettings({ app, onSaved }) {
  const [key, setKey] = useState('');
  const [edit, setEdit] = useState(!app.has_secret);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ error: '', ok: '' });

  const update = async (body, ok) => {
    setBusy(true);
    setMsg({ error: '', ok: '' });
    try {
      onSaved(await api.apps.update(app.id, body));
      setMsg({ error: '', ok });
      return true;
    } catch (e) {
      setMsg({ error: e.message, ok: '' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid max-w-3xl gap-5">
      <Section icon="lock" title="Unsplash Access Key" hint={edit ? 'Fra unsplash.com/oauth/applications → din applikasjon → Keys. Steg-for-steg under «Om appen».' : null} flush={!edit}>
        {edit ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await update({ api_key: key.trim() }, 'Nøkkelen virker og er lagret.')) {
                setKey('');
                setEdit(false);
              }
            }}
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Access Key"
              autoComplete="off"
              className="h-10 rounded-xl border border-line bg-paper px-3 font-mono text-sm text-ink outline-none focus:border-focus"
            />
            <Button type="submit" disabled={busy || !key.trim()}>
              {busy ? 'Sjekker …' : 'Lagre nøkkel'}
            </Button>
          </form>
        ) : (
          <div className="flex items-center gap-2 px-5 pb-4 text-sm">
            <Dot tone="ok" />
            <span className="text-ink">Tilkoblet</span>
            <span className="font-mono text-muted">· {app.config?.key_hint || 'lagret'}</span>
            <button type="button" onClick={() => setEdit(true)} className="ml-auto text-xs font-semibold text-brand hover:underline">
              Bytt
            </button>
            <button type="button" onClick={() => update({ api_key: null }, 'Nøkkelen er fjernet.').then((ok) => ok && setEdit(true))} className="text-xs font-semibold text-danger hover:underline">
              Fjern
            </button>
          </div>
        )}
        {(msg.error || msg.ok) && <p className={`m-0 ${edit ? 'pt-3' : 'px-5 pb-4'} text-sm ${msg.error ? 'text-danger' : 'text-brand'}`}>{msg.error || msg.ok}</p>}
      </Section>
      <p className="m-0 text-sm text-muted">
        Bildene finner du under <strong>Unsplash</strong> i bildevelgeren i editoren. De lagres i mediebiblioteket i mappen «Unsplash» med fotografens navn i filnavnet. Claude AI kan også søke opp bilder når appen er tilkoblet.
      </p>
    </div>
  );
}
