// Kommentarer i editoren (src/api/comments.js): tråder per lysbilde, valgfritt
// knyttet til et element, med svar, «Løst» og @-omtaler av teamet.

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/api.js';
import { ELEMENT_LABEL } from '../../../lib/deck.js';
import { Button } from '../ui.jsx';

const initials = (s) =>
  String(s || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

function ago(iso) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'nå';
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.round(min / 60)} t`;
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

/** Tekst med @-omtaler uthevet. */
function Body({ text, members }) {
  const names = members.map((m) => `@${m.name}`).sort((a, b) => b.length - a.length);
  if (!names.length) return <span>{text}</span>;
  const re = new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.split(re).map((part, i) => (names.includes(part) ? <strong key={i} className="text-brand">{part}</strong> : <span key={i}>{part}</span>));
}

/** Skrivefelt med @-forslag. onSend(body, mentions[]) */
function Composer({ members, placeholder, onSend, autoFocus }) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState([]);
  const [query, setQuery] = useState(null); // tekst etter @ mens du skriver
  const ref = useRef(null);
  const hits = query === null ? [] : members.filter((m) => m.name.toLowerCase().startsWith(query.toLowerCase()) || m.email.startsWith(query.toLowerCase())).slice(0, 5);

  const onChange = (e) => {
    const v = e.target.value;
    setText(v);
    const before = v.slice(0, e.target.selectionStart);
    const m = /(^|\s)@([\wæøåÆØÅ.-]*)$/.exec(before);
    setQuery(m ? m[2] : null);
  };
  const pick = (m) => {
    const el = ref.current;
    const pos = el.selectionStart;
    const before = text.slice(0, pos).replace(/@([\wæøåÆØÅ.-]*)$/, `@${m.name} `);
    setText(before + text.slice(pos));
    setMentions((list) => [...new Set([...list, m.email])]);
    setQuery(null);
    setTimeout(() => el.focus(), 0);
  };
  const send = () => {
    if (!text.trim()) return;
    // Bare omtaler som fortsatt står i teksten.
    const still = mentions.filter((e) => text.includes(`@${members.find((m) => m.email === e)?.name}`));
    onSend(text.trim(), still);
    setText('');
    setMentions([]);
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        autoFocus={autoFocus}
        rows={2}
        value={text}
        onChange={onChange}
        onKeyDown={(e) => {
          if (hits.length && (e.key === 'Enter' || e.key === 'Tab')) {
            e.preventDefault();
            pick(hits[0]);
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          } else if (e.key === 'Escape') setQuery(null);
        }}
        placeholder={placeholder}
        className="block w-full resize-none rounded-lg border border-line bg-paper px-2.5 py-2 text-sm text-ink outline-none focus:border-focus"
      />
      {hits.length > 0 && (
        <ul className="absolute bottom-full left-0 z-20 mb-1 w-56 list-none rounded-lg border border-line bg-card p-1 shadow-pop">
          {hits.map((m) => (
            <li key={m.email}>
              <button type="button" onMouseDown={(e) => (e.preventDefault(), pick(m))} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-zone">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-tint text-[10px] font-bold text-brand">{initials(m.name)}</span>
                <span className="min-w-0 truncate text-ink">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CommentsPanel({ playlistId, slide, slides, selected, onSelectElement, onSelectSlide, onCount }) {
  const [data, setData] = useState(null);
  const [scope, setScope] = useState('slide');
  const [showResolved, setShowResolved] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api.comments
      .list(playlistId)
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  const comments = data?.comments || [];
  const members = data?.members || [];
  // Åpne tråder per lysbilde (merker i lysbildelisten).
  const openBySlide = useMemo(() => {
    const m = {};
    for (const c of comments) if (!c.parent_id && !c.resolved && c.slide_id) m[c.slide_id] = (m[c.slide_id] || 0) + 1;
    return m;
  }, [comments]);
  useEffect(() => onCount?.(openBySlide), [openBySlide, onCount]);

  const add = async (body, mentions, extra = {}) => {
    setError('');
    try {
      await api.comments.add({ playlist_id: playlistId, slide_id: slide?.id, body, mentions, ...extra });
      setReplyTo(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  const act = async (fn) => {
    try {
      await fn();
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const threads = comments
    .filter((c) => !c.parent_id)
    .filter((c) => (scope === 'slide' ? c.slide_id === slide?.id : true))
    .filter((c) => showResolved || !c.resolved)
    .reverse();
  const replies = (id) => comments.filter((c) => c.parent_id === id);
  const target = selected?.length === 1 ? selected[0] : null;
  const slideName = (id) => {
    const i = slides.findIndex((s) => s.id === id);
    return i < 0 ? 'slettet lysbilde' : `Lysbilde ${i + 1}${slides[i].name ? ` «${slides[i].name}»` : ''}`;
  };
  const elementName = (id) => {
    const el = slides.flatMap((s) => s.elements).find((e) => e.id === id);
    if (!el) return null;
    return el.kind === 'text' ? `«${String(el.config?.text || 'Tekst').split('\n')[0].slice(0, 30)}»` : ELEMENT_LABEL[el.kind] || el.kind;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-2 py-2 text-xs">
        {[
          ['slide', 'Dette lysbildet'],
          ['all', 'Alle']
        ].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setScope(id)} className={`rounded-full px-2.5 py-1 font-semibold ${scope === id ? 'bg-zone text-ink' : 'text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-muted">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Løste
        </label>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {error && <p className="m-0 rounded-lg bg-danger-tint px-3 py-2 text-xs text-danger">{error}</p>}
        {data && !threads.length && <p className="m-0 text-sm text-muted">{scope === 'slide' ? 'Ingen kommentarer på dette lysbildet.' : 'Ingen kommentarer ennå.'}</p>}
        {threads.map((c) => (
          <div key={c.id} className={`rounded-xl border border-hair p-2.5 ${c.resolved ? 'opacity-60' : 'bg-paper'}`}>
            {(scope === 'all' || c.element_id) && (
              <div className="mb-1.5 flex flex-wrap gap-1 text-[11px]">
                {scope === 'all' && c.slide_id && (
                  <button type="button" onClick={() => onSelectSlide?.(c.slide_id)} className="rounded-full bg-zone px-2 py-0.5 text-muted hover:text-ink">
                    {slideName(c.slide_id)}
                  </button>
                )}
                {c.element_id && elementName(c.element_id) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (c.slide_id) onSelectSlide?.(c.slide_id);
                      setTimeout(() => onSelectElement?.(c.element_id), 50);
                    }}
                    className="rounded-full bg-brand-tint px-2 py-0.5 font-semibold text-brand"
                  >
                    {elementName(c.element_id)}
                  </button>
                )}
              </div>
            )}
            {[c, ...replies(c.id)].map((r, i) => (
              <div key={r.id} className={`flex gap-2 ${i ? 'mt-2 border-t border-hair pt-2' : ''}`}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-tint text-[10px] font-bold text-brand">{initials(r.author_name || r.author_email)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs">
                    <strong className="text-ink">{r.author_name || r.author_email || 'Noen'}</strong> <span className="text-muted">{ago(r.created_at)}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm text-ink">
                    <Body text={r.body} members={members} />
                  </div>
                </div>
                {r.author_email === data?.me && (
                  <button type="button" onClick={() => act(() => api.comments.remove(r.id))} className="self-start text-[11px] text-muted hover:text-danger" title="Slett">
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="mt-2 flex gap-3 text-xs font-semibold">
              {!c.resolved && (
                <button type="button" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="text-brand hover:underline">
                  Svar
                </button>
              )}
              <button type="button" onClick={() => act(() => api.comments.update(c.id, { resolved: !c.resolved }))} className="text-muted hover:text-ink">
                {c.resolved ? 'Åpne igjen' : '✓ Løst'}
              </button>
            </div>
            {replyTo === c.id && (
              <div className="mt-2">
                <Composer autoFocus members={members} placeholder="Svar … (@ for å nevne)" onSend={(body, mentions) => add(body, mentions, { parent_id: c.id })} />
              </div>
            )}
          </div>
        ))}
      </div>

      {slide && (
        <div className="border-t border-line p-2">
          <div className="mb-1 px-0.5 text-[11px] text-muted">
            Kommentar på {target ? <strong className="text-ink">{elementName(target.id) || 'valgt element'}</strong> : slideName(slide.id).toLowerCase()}
          </div>
          <Composer members={members} placeholder="Skriv en kommentar … (@ for å nevne noen)" onSend={(body, mentions) => add(body, mentions, { element_id: target?.id })} />
        </div>
      )}
    </div>
  );
}
