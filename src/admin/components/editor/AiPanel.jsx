// AI-fanen i editoren: samtalen med Claude om denne presentasjonen, med
// tankegang, verktøysteg og svar. Endringer vises live på lerretet
// (onChanged laster presentasjonen på nytt). Se src/api/ai.js.

import { useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api.js';
import { Icon, Button } from '../ui.jsx';
import { chosenAgent, chooseAgent } from '../aiAgent.js';

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

const TOOL_LABEL = {
  get_presentation: 'Leser presentasjonen',
  set_presentation: 'Endrer presentasjonen',
  add_slide: 'Lager lysbilde',
  update_slide: 'Endrer lysbilde',
  move_slide: 'Flytter lysbilde',
  delete_slide: 'Sletter lysbilde',
  add_elements: 'Legger til elementer',
  update_elements: 'Endrer elementer',
  delete_elements: 'Sletter elementer',
  list_media: 'Ser i biblioteket',
  list_data: 'Ser på apper og program'
};

const SUGGESTIONS = [
  'Lag en velkomstpresentasjon for besøkende med klokke og vær',
  'Gjør alle titlene større og mer lesbare på avstand',
  'Lag et lysbilde med dagens program og en QR-kode til påmelding'
];

/**
 * Gjør lagrede meldinger om til visningsturer: brukermeldinger, og
 * assistentturer med blokker (tenking, tekst, verktøysteg med status).
 */
function toTurns(messages) {
  const status = {};
  for (const m of messages)
    if (m.role === 'user') for (const b of m.content || []) if (b.type === 'tool_result') status[b.tool_use_id] = b.is_error ? 'error' : 'ok';
  const turns = [];
  for (const m of messages) {
    if (m.role === 'user') {
      const text = (m.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const ctx = (m.content || []).find((b) => b.type === 'flatr_context');
      if (text) turns.push({ role: 'user', text, author: m.author, at: m.created_at, context: ctx ? ctx.ids.length : null });
      continue;
    }
    // Påfølgende assistentmeldinger (én per verktøyrunde) vises som én tur.
    let turn = turns[turns.length - 1];
    if (!turn || turn.role !== 'assistant') {
      turn = { role: 'assistant', blocks: [] };
      turns.push(turn);
    }
    for (const b of m.content || []) {
      if (b.type === 'thinking' && b.thinking) turn.blocks.push({ type: 'thinking', text: b.thinking });
      else if (b.type === 'flatr_thinking' && b.text) turn.blocks.push({ type: 'thinking', text: b.text }); // Cursor AI
      else if (b.type === 'text' && b.text) turn.blocks.push({ type: 'text', text: b.text });
      else if (b.type === 'tool_use') turn.blocks.push({ type: 'tool', id: b.id, name: b.name, status: status[b.id] || 'error' });
    }
  }
  return turns;
}

/** Leser en SSE-strøm fra fetch og kaller onEvent(navn, data). */
async function readSse(res, onEvent) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message';
      let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      try {
        onEvent(event, data ? JSON.parse(data) : {});
      } catch {
        /* ugyldig hendelse */
      }
    }
  }
}

function Thinking({ text, live }) {
  const [open, setOpen] = useState(false);
  const show = open || live;
  return (
    <div className="rounded-lg border border-line/70 bg-zone/40">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs font-semibold text-muted hover:text-ink">
        <Icon name="chevron" className={`h-3 w-3 transition-transform ${show ? 'rotate-90' : ''}`} />
        {live ? <span className="animate-pulse">Tenker …</span> : 'Tankegang'}
      </button>
      {show && text && <div className="max-h-56 overflow-y-auto whitespace-pre-wrap px-3 pb-2.5 text-xs leading-relaxed text-muted">{text}</div>}
    </div>
  );
}

function ToolStep({ name, status, label }) {
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted">
      {status === 'running' ? (
        <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      ) : status === 'ok' ? (
        <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-ok" />
      ) : (
        <Icon name="x" className="h-3.5 w-3.5 shrink-0 text-danger" />
      )}
      <span className="truncate">{label || TOOL_LABEL[name] || name}</span>
    </div>
  );
}

function AssistantTurn({ blocks, live }) {
  return (
    <div className="grid gap-1.5">
      {blocks.map((b, i) =>
        b.type === 'thinking' ? (
          <Thinking key={i} text={b.text} live={live && i === blocks.length - 1} />
        ) : b.type === 'tool' ? (
          <ToolStep key={b.id || i} name={b.name} status={b.status} label={b.label} />
        ) : (
          <div key={i} className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {b.text}
          </div>
        )
      )}
    </div>
  );
}

function KeySetup({ app, onSaved }) {
  const cursor = app.kind === 'cursor';
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.apps.update(app.id, { api_key: key.trim() });
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="m-3 grid gap-3 rounded-xl border border-line bg-zone/40 p-4 text-sm">
      <div className="font-semibold text-ink">Koble til {cursor ? 'Cursor' : 'Claude'}</div>
      <p className="m-0 text-xs leading-relaxed text-muted">
        {app.name} bruker kontoens egen API-nøkkel fra {cursor ? 'Cursor' : 'Anthropic'}. Lag en på{' '}
        <a
          href={cursor ? 'https://cursor.com/dashboard' : 'https://console.anthropic.com/settings/keys'}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-brand hover:underline"
        >
          {cursor ? 'cursor.com/dashboard' : 'console.anthropic.com'}
        </a>{' '}
        og lim den inn her. Nøkkelen lagres kryptert og vises aldri igjen. Bruken faktureres på {cursor ? 'Cursor' : 'Anthropic'}-kontoen.
      </p>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={cursor ? 'key_…' : 'sk-ant-…'}
        autoComplete="off"
        className="h-9 rounded-lg border border-line bg-paper px-3 font-mono text-xs text-ink outline-none focus:border-focus"
      />
      {err && <p className="m-0 text-xs text-danger">{err}</p>}
      <Button type="submit" size="sm" disabled={busy || !key.trim()}>
        {busy ? 'Sjekker nøkkelen …' : 'Lagre nøkkel'}
      </Button>
    </form>
  );
}

export default function AiPanel({ playlistId, onChanged, pending, onPendingUsed }) {
  const [data, setData] = useState(null); // { app, running, messages }
  const [live, setLive] = useState(null); // assistentblokker under strømming
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const sentPending = useRef(null);

  const [agent, setAgent] = useState(chosenAgent);
  const load = () =>
    api.ai
      .history(playlistId, agent)
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId, agent]);

  // Valgt assistent (⌘K-dialogen og denne fanen deler valget).
  useEffect(() => {
    const on = (e) => setAgent(e.detail || null);
    window.addEventListener('flatr:ai-agent', on);
    return () => window.removeEventListener('flatr:ai-agent', on);
  }, []);

  // Hold bunnen i syne mens det strømmer.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data, live]);

  const send = async (text) => {
    const message = String(text || '').trim();
    if (!message || busy) return;
    setError('');
    setBusy(true);
    setDraft('');
    setData((d) => d && { ...d, messages: [...d.messages, { role: 'user', content: [{ type: 'text', text: message }] }] });
    const blocks = [];
    const push = () => setLive([...blocks]);
    setLive([]);
    let changedT = null;
    try {
      const res = await api.ai.send(playlistId, message, data?.app?.kind);
      await readSse(res, (event, d) => {
        if (event === 'thinking_start') blocks.push({ type: 'thinking', text: '' });
        else if (event === 'thinking_delta') {
          const last = blocks[blocks.length - 1];
          if (last?.type === 'thinking') last.text += d.text;
        } else if (event === 'text_start') blocks.push({ type: 'text', text: '' });
        else if (event === 'text_delta') {
          const last = blocks[blocks.length - 1];
          if (last?.type === 'text') last.text += d.text;
        } else if (event === 'tool_start') blocks.push({ type: 'tool', id: d.id, name: d.name, label: d.label, status: 'running' });
        else if (event === 'tool_done') {
          const t = blocks.find((b) => b.type === 'tool' && b.id === d.id);
          if (t) t.status = d.ok ? 'ok' : 'error';
        } else if (event === 'changed') {
          // Samle raske endringer til én omlasting av lerretet.
          clearTimeout(changedT);
          changedT = setTimeout(() => onChanged?.(), 150);
        } else if (event === 'notice') blocks.push({ type: 'text', text: d.text });
        else if (event === 'error') {
          setError(d.message);
          if (d.retry) setDraft((cur) => cur || message); // meldingen ble ikke lagret – legg den tilbake i feltet
        }
        push();
      });
    } catch (e) {
      setError(e.code === 'no_key' ? '' : e.message);
    } finally {
      setBusy(false);
      setLive(null);
      onChanged?.();
      load();
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const hasKey = !!data?.app?.has_key;
  // Melding fra ⌘K: send når nøkkelen er på plass.
  useEffect(() => {
    if (!pending || !hasKey || sentPending.current === pending.id) return;
    sentPending.current = pending.id;
    onPendingUsed?.();
    send(pending.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, hasKey]);

  const stop = () => api.ai.stop(playlistId).catch(() => {});
  const clear = async () => {
    setMenu(false);
    try {
      await api.ai.clear(playlistId);
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  if (!data) return <p className="m-0 p-4 text-sm text-muted">{error || 'Laster …'}</p>;
  if (!data.app)
    return (
      <div className="m-3 grid gap-3 rounded-xl border border-line bg-zone/40 p-4 text-sm">
        <div className="font-semibold text-ink">Aktiver Claude AI</div>
        <p className="m-0 text-xs leading-relaxed text-muted">AI-assistenten er en Flatr App. Aktiver Claude AI og legg inn en API-nøkkel fra Anthropic, så kan du lage og endre presentasjoner ved å skrive hva du vil ha.</p>
        <a href="/admin?view=apps&app=claude" className="inline-flex h-9 items-center justify-center rounded-lg bg-brand px-3 text-xs font-semibold text-onbrand hover:bg-brand-dark">
          Gå til Claude AI
        </a>
      </div>
    );
  if (!hasKey)
    return (
      <>
        <KeySetup app={data.app} onSaved={load} />
        {pending && <p className="m-0 px-4 text-xs text-muted">Meldingen din sendes når nøkkelen er lagret.</p>}
      </>
    );

  const turns = toTurns(data.messages);
  const usage = data.app.usage;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Icon name="sparkle" className="h-3.5 w-3.5 text-brand" />
          {data.apps?.length > 1 ? (
            <select value={data.app.kind} onChange={(e) => chooseAgent(e.target.value)} disabled={busy} className="cursor-pointer bg-transparent text-muted outline-none hover:text-ink" aria-label="Assistent">
              {data.apps.map((a) => (
                <option key={a.kind} value={a.kind}>
                  {a.kind === 'claude' ? `${a.name} · ${a.model}` : a.model === 'Cursor' ? a.name : `Cursor · ${a.model}`}
                </option>
              ))}
            </select>
          ) : (
            <>
              {data.app.name} · {data.app.model}
            </>
          )}
        </span>
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} className="rounded-md px-1.5 py-0.5 font-bold hover:bg-zone hover:text-ink" aria-label="Mer">
            ⋯
          </button>
          {menu && (
            <div className="absolute right-0 top-7 z-20 grid w-56 gap-0.5 rounded-xl border border-line bg-card p-1 text-sm shadow-pop">
              <button type="button" onClick={clear} disabled={busy} className="rounded-lg px-3 py-2 text-left text-ink hover:bg-zone disabled:opacity-50">
                Tøm samtalen
              </button>
              <a href={`/admin?view=apps&app=${data.app.kind}`} className="rounded-lg px-3 py-2 text-left text-ink hover:bg-zone">
                Innstillinger for {data.app.name} {data.app.key_hint ? `(${data.app.key_hint})` : ''}
              </a>
              {usage && (
                <div className="border-t border-line px-3 py-2 text-[11px] leading-relaxed text-muted">
                  Brukt siden {new Date(usage.since).toLocaleDateString('nb-NO')}: {Math.round((usage.input + usage.cache_read + usage.cache_write) / 1000)}k inn ·{' '}
                  {Math.round(usage.output / 1000)}k ut (tokens)
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {!turns.length && !live && (
          <div className="grid gap-2 pt-2">
            <p className="m-0 text-sm text-muted">Be om en ny presentasjon, eller endringer i denne. Assistenten kan bare endre denne presentasjonen, og alt kan angres.</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="rounded-xl border border-line px-3 py-2 text-left text-xs text-ink hover:bg-zone">
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) =>
          t.role === 'user' ? (
            <div key={i} className="ml-6 grid justify-items-end gap-1">
              {t.context != null && (
                <span className="rounded-full bg-zone px-2 py-0.5 text-[11px] text-muted">
                  {t.context ? `📎 Fast kontekst (${t.context}) lagt ved` : 'Fast kontekst fjernet'}
                </span>
              )}
              <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-tint px-3 py-2 text-sm text-ink">{t.text}</div>
            </div>
          ) : (
            <AssistantTurn key={i} blocks={t.blocks} />
          )
        )}
        {live && (live.length ? <AssistantTurn blocks={live} live /> : <Thinking live text="" />)}
        {error && <p className="m-0 rounded-lg bg-danger-tint px-3 py-2 text-xs text-danger">{error}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="border-t border-line p-2"
      >
        <div className="rounded-xl border border-line bg-paper focus-within:border-focus">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={3}
            placeholder={busy ? 'Assistenten jobber …' : 'Hva vil du endre?'}
            className="block w-full resize-none bg-transparent px-3 py-2 text-sm text-ink outline-none"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[11px] text-muted">{MOD}K fra hvor som helst</span>
            {busy ? (
              <Button type="button" size="sm" variant="outline" onClick={stop}>
                Stopp
              </Button>
            ) : (
              <Button type="submit" size="sm" disabled={!draft.trim()}>
                Send
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
