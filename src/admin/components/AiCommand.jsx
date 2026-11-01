// ⌘K / Ctrl+K: skriv hva du vil ha, så åpnes editoren (ny eller valgt
// presentasjon) med AI-fanen, og meldingen sendes til assistenten der.
// «+» legger til fast kontekst (merkevare o.l.) som AI-en alltid følger.

import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { AI_PROMPT_KEY } from './editor/Editor.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import { AddContext } from './AiContext.jsx';
import { chosenAgent, chooseAgent } from './aiAgent.js';
import { Icon, Button } from './ui.jsx';
import { tr, locale } from '../../lib/i18n.js';

const NEW = 'new';
const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
const param = (name) => new URLSearchParams(window.location.search).get(name) || '';
const EFFORTS = [
  { value: 'low', label: tr('Rask') },
  { value: 'medium', label: tr('Balansert') },
  { value: 'high', label: tr('Grundig') }
];

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 5 ? 'God natt' : h < 10 ? 'God morgen' : h < 12 ? 'God formiddag' : h < 18 ? 'God ettermiddag' : 'God kveld';
  const first = String(name || '').trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

function ago(iso) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min)) return '';
  if (min < 60) return `${Math.max(1, min)} min siden`;
  if (min < 24 * 60) return `${Math.round(min / 60)} t siden`;
  return new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}

/** Lite stjerne-/gnistmerke i Claude-stil. */
function Spark({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1="12" y1="12" x2="12" y2={i % 2 ? 3.5 : 1.5} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" transform={`rotate(${i * 30} 12 12)`} />
      ))}
    </svg>
  );
}

/** Merket til valgt assistent: Cursor-ikonet (egen logo fra app-katalogen) eller Claude-gnisten. */
function AgentMark({ kind, icon }) {
  if (kind !== 'cursor') return <Spark className="h-10 w-10 shrink-0 text-[#d97757]" />;
  if (icon) return <img src={icon} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />;
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10 shrink-0 text-ink" aria-hidden="true">
      <path d="M12 2 21 7v10l-9 5-9-5V7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 12 21 7M12 12v10M12 12 3 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export default function AiCommand({ go, me }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [target, setTarget] = useState(NEW);
  const [orientation, setOrientation] = useState('landscape');
  const [playlists, setPlaylists] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [assistant, setAssistant] = useState(undefined); // undefined = laster, null = ikke aktivert
  const [assistants, setAssistants] = useState([]); // alle aktiverte (velger når flere)
  const [plus, setPlus] = useState(false);
  const [icons, setIcons] = useState({}); // egne app-ikoner (Cursor-logoen)
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = (e) => {
      if (e.detail?.agent) chooseAgent(e.detail.agent);
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('flatr:ai-open', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('flatr:ai-open', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setError('');
    setPlus(false);
    // Står du i editoren, gjelder meldingen den presentasjonen.
    const editing = param('view') === 'playlists' && param('edit');
    setTarget(editing || NEW);
    api.ai
      .app(chosenAgent())
      .then((r) => {
        setAssistant(r?.app || null);
        setAssistants(r?.apps || []);
      })
      .catch(() => setAssistant(null));
    api.appMarket
      .list()
      .then((r) => setIcons(r?.official_icons || {}))
      .catch(() => {});
    api.playlists
      .list()
      .then((rows) => setPlaylists(Array.isArray(rows) ? rows : []))
      .catch(() => setPlaylists([]));
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const submit = async () => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setError('');
    try {
      let id = target;
      if (target === NEW) {
        const name = prompt.split('\n')[0].replace(/^(lag|lage|make|create)\s+(en|et|a|an)?\s*/i, '').slice(0, 50) || 'Ny presentasjon';
        const created = await api.playlists.create({ name: name.charAt(0).toUpperCase() + name.slice(1), orientation });
        id = String(created.id);
      }
      const payload = { playlist: Number(id), text: prompt, id: Date.now() };
      if (param('view') === 'playlists' && param('edit') === String(id)) {
        window.dispatchEvent(new CustomEvent('flatr:ai', { detail: payload }));
      } else {
        sessionStorage.setItem(AI_PROMPT_KEY, JSON.stringify(payload));
        go('playlists', { edit: id });
      }
      setText('');
      setOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const switchAgent = async (kind) => {
    chooseAgent(kind);
    const r = await api.ai.app(kind).catch(() => null);
    if (r?.app) setAssistant(r.app);
  };

  const setEffort = async (effort) => {
    setAssistant((a) => a && { ...a, effort });
    await api.apps.update(assistant.id, { config: { effort } }).catch(() => {});
  };

  if (!open) return null;

  const shell = (children) => (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-paper/95 px-4 backdrop-blur-md" onMouseDown={() => setOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <div role="dialog" aria-label={tr('AI-assistent')} className="mx-auto w-full max-w-3xl pb-16 pt-[12vh]" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setOpen(false)} className="fixed right-5 top-5 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-zone hover:text-ink" aria-label={tr('Lukk (Esc)')}>
          <Icon name="x" className="h-5 w-5" />
        </button>
        <h1 className="m-0 mb-8 flex items-center justify-center gap-3 text-center text-ink" style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400, fontSize: 'clamp(30px, 4vw, 44px)' }}>
          <AgentMark kind={assistant?.kind} icon={icons.cursor} />
          {greeting(me?.name)}
        </h1>
        {children}
      </div>
    </div>
  );

  if (assistant === null)
    return shell(
      <div className="mx-auto max-w-lg rounded-3xl border border-line bg-card p-6 text-center shadow-card">
        <p className="m-0 text-base text-ink">{tr('Lag og endre presentasjoner ved å skrive hva du vil ha.')}</p>
        <p className="m-0 mt-2 text-sm text-muted">{tr('Aktiver Flatr-appen Claude AI og legg inn en API-nøkkel fra Anthropic for å komme i gang.')}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            {tr('Ikke nå')}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setOpen(false);
              go('apps', { app: 'claude' });
            }}
          >
            {tr('Gå til Claude AI')}
          </Button>
        </div>
      </div>
    );

  const cursorChosen = assistant?.kind === 'cursor';
  const recent = [...playlists].sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')).slice(0, 3);
  const context = assistant?.context || [];

  return shell(
    <>
      <div className="relative rounded-3xl border border-line bg-card shadow-card transition-colors focus-within:border-focus/60">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder={target === NEW ? tr('Hva vil du lage? F.eks. «Infoskjerm for kantina med dagens meny og vær»') : tr('Hva vil du endre i presentasjonen?')}
          className="block min-h-[96px] w-full resize-none rounded-3xl bg-transparent px-6 pt-5 text-lg text-ink outline-none placeholder:text-muted"
        />
        <div className="flex items-center gap-2 px-4 pb-4 pt-1">
          <button
            type="button"
            onClick={() => setPlus((p) => !p)}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink hover:bg-zone ${plus ? 'bg-zone' : ''}`}
            aria-label={tr('Legg til fast kontekst')}
            title={tr('Legg til fast kontekst (merkevare, retningslinjer)')}
          >
            <Icon name="plus" className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {context.map((c) => (
              <span key={c.id} className="group inline-flex max-w-[240px] items-center gap-1 rounded-full bg-zone py-1 pl-2.5 pr-1 text-xs text-ink/80" title={tr('Fast kontekst: {0}', [c.title])}>
                {c.kind === 'pdf' ? '📄' : c.kind === 'link' ? '🔗' : '📝'} <span className="truncate">{c.title}</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setAssistant(await api.ai.removeContext(c.id, assistant?.kind));
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted hover:bg-line hover:text-danger"
                  aria-label={tr('Fjern {0}', [c.title])}
                  title={tr('Fjern fra fast kontekst')}
                >
                  <Icon name="x" className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !text.trim()}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-opacity hover:opacity-90 disabled:opacity-30 ${cursorChosen ? 'bg-ink text-paper' : 'bg-[#d97757] text-white'}`}
            aria-label={tr('Start')}
          >
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <span className="text-lg leading-none">↑</span>}
          </button>
        </div>
        {plus && (
          <div className="border-t border-line px-5 py-4">
            <div className="mb-2 text-xs text-muted">
              <strong className="text-ink">{tr('Fast kontekst')}</strong> {tr('– Claude husker og følger dette i alle presentasjoner (merkevareretningslinjer, designmanual, tone of voice).')}{' '}
              <button type="button" onClick={() => (setOpen(false), go('apps', { app: 'claude' }))} className="font-semibold text-brand hover:underline">
                {tr('Administrer')}
              </button>
            </div>
            <AddContext compact agent={assistant?.kind} onChange={(a) => setAssistant(a)} />
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 text-sm">
        <label className="flex min-w-0 items-center gap-1 text-ink">
          <span className="sr-only">{tr('Presentasjon')}</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="max-w-[260px] cursor-pointer truncate bg-transparent font-medium text-ink outline-none">
            <option value={NEW}>{tr('Ny presentasjon')}</option>
            {playlists.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {target === NEW && (
          <select value={orientation} onChange={(e) => setOrientation(e.target.value)} className="cursor-pointer bg-transparent text-muted outline-none" aria-label={tr('Format')}>
            <option value="landscape">{tr('Liggende 16:9')}</option>
            <option value="portrait">{tr('Stående 9:16')}</option>
          </select>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {assistants.length > 1 ? (
            <select value={assistant?.kind || ''} onChange={(e) => switchAgent(e.target.value)} className="cursor-pointer bg-transparent text-ink outline-none" aria-label={tr('Assistent')}>
              {assistants.map((a) => (
                <option key={a.kind} value={a.kind}>
                  {a.kind === 'claude' ? a.model : a.model === 'Cursor' ? a.name : tr('Cursor · {0}', [a.model])}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-ink">{assistant?.model?.replace(/^Claude /, '') || '…'}</span>
          )}
          {assistant?.kind !== 'cursor' && (
          <select value={assistant?.effort || 'medium'} onChange={(e) => setEffort(e.target.value)} className="cursor-pointer bg-transparent text-muted outline-none" aria-label={tr('Innsats')}>
            {EFFORTS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
          )}
        </div>
      </div>
      {assistant && !assistant.has_key && (
        <p className="m-0 mt-3 px-3 text-sm text-warn">
          {assistant.included?.exhausted
            ? tr('Månedens Flatr AI er brukt opp. Den fylles på igjen {0}, eller legg inn en egen nøkkel under Flatr Apps.', [new Date(assistant.included.resets_at).toLocaleDateString(locale(), { day: 'numeric', month: 'long' })])
            : tr('{0} mangler API-nøkkel – legg den inn under Flatr Apps.', [assistant.name])}
        </p>
      )}
      {error && <p className="m-0 mt-3 px-3 text-sm text-danger">{error}</p>}

      {recent.length > 0 && (
        <section className="mt-12">
          <div className="mb-3 flex items-center justify-between px-3 text-sm">
            <span className="text-muted">{tr('Siste presentasjoner')}</span>
            <button type="button" onClick={() => (setOpen(false), go('playlists'))} className="text-muted hover:text-ink">
              {tr('Se alle')}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {recent.map((p) => {
              const selected = target === String(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setTarget(selected ? NEW : String(p.id));
                    inputRef.current?.focus();
                  }}
                  className={`rounded-2xl border bg-card p-2 text-left transition-colors hover:bg-zone/60 ${selected ? (cursorChosen ? 'border-ink ring-1 ring-ink' : 'border-[#d97757] ring-1 ring-[#d97757]') : 'border-line'}`}
                  title={selected ? tr('Valgt – klikk for å velge ny presentasjon i stedet') : tr('Bruk denne presentasjonen')}
                >
                  <div className="pointer-events-none">
                    <LiveScreenView playlistId={p.id} orientation={p.orientation} />
                  </div>
                  <div className="px-1.5 pb-1 pt-2.5">
                    <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                    <div className="text-xs text-muted">{selected ? tr('Valgt') : ago(p.updated_at || p.created_at)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <p className="m-0 mt-10 text-center text-xs text-muted">
        {tr('Enter for å starte · Shift+Enter for ny linje · Esc lukker ·')} {MOD}{tr('K åpner hvor som helst')}
      </p>
    </>
  );
}
