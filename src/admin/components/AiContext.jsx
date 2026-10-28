// Fast kontekst for AI-assistenten (merkevareretningslinjer o.l.): legg til
// lenke, PDF eller tekst, og fjern. Brukes i ⌘K (+) og i Claude AI-appen.
// Se src/api/agents/context.js.

import { useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Button } from './ui.jsx';

const KIND_ICON = { pdf: '📄', link: '🔗', text: '📝' };
const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);

/** Skjema for å legge til. mode: null | 'link' | 'text'. onChange(app) får oppdatert app. */
export function AddContext({ onChange, compact = false, agent }) {
  const [mode, setMode] = useState(null);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      onChange(await fn());
      setMode(null);
      setUrl('');
      setText('');
      setTitle('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-zone disabled:opacity-50';
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => setMode(mode === 'link' ? null : 'link')} disabled={busy}>
          🔗 Lenke
        </button>
        <button type="button" className={btn} onClick={() => fileRef.current?.click()} disabled={busy}>
          📄 PDF
        </button>
        <button type="button" className={btn} onClick={() => setMode(mode === 'text' ? null : 'text')} disabled={busy}>
          📝 Tekst
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) run(() => api.ai.addPdf(f, agent));
          }}
        />
        {busy && <span className="self-center text-xs text-muted">{mode === 'link' ? 'Henter siden …' : 'Laster opp …'}</span>}
      </div>
      {mode === 'link' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api.ai.addLink(url.trim(), title.trim() || undefined, agent));
          }}
          className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-[minmax(0,1fr)_auto]'}`}
        >
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… (nettside eller PDF)"
            className="h-9 rounded-lg border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-focus"
          />
          <Button type="submit" size="sm" disabled={busy || !/^https?:\/\/\S+\.\S+/.test(url.trim())}>
            Legg til
          </Button>
        </form>
      )}
      {mode === 'text' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api.ai.addText(text, title.trim() || undefined, agent));
          }}
          className="grid gap-2"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tittel, f.eks. «Tone of voice»"
            className="h-9 rounded-lg border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-focus"
          />
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Lim inn retningslinjer, fakta om bedriften, ord dere bruker og ikke bruker …"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-focus"
          />
          <Button type="submit" size="sm" disabled={busy || !text.trim()} className="justify-self-start">
            Legg til
          </Button>
        </form>
      )}
      {error && <p className="m-0 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Lista over fast kontekst med fjern-knapp. */
export function ContextList({ items, onChange, empty = 'Ingen fast kontekst ennå.', agent }) {
  const [busy, setBusy] = useState(null);
  if (!items?.length) return <p className="m-0 text-sm text-muted">{empty}</p>;
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {items.map((i) => (
        <li key={i.id} className="flex items-center gap-2.5 rounded-lg border border-hair bg-paper px-3 py-2 text-sm">
          <span aria-hidden="true">{KIND_ICON[i.kind] || '📎'}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-ink">{i.title}</div>
            <div className="truncate text-xs text-muted">
              {i.kind === 'pdf' ? `PDF · ${kb(i.size || 0)}` : i.kind === 'link' ? 'Nettside' : 'Tekst'}
              {i.url && (
                <>
                  {' · '}
                  <a href={i.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {i.url.replace(/^https?:\/\//, '')}
                  </a>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={busy === i.id}
            onClick={async () => {
              setBusy(i.id);
              try {
                onChange(await api.ai.removeContext(i.id, agent));
              } finally {
                setBusy(null);
              }
            }}
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-zone hover:text-danger"
            aria-label={`Fjern ${i.title}`}
            title="Fjern"
          >
            <Icon name="x" className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
