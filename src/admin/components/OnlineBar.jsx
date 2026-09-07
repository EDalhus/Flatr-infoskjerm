import { useEffect, useRef, useState } from 'react';

// Alle som er pålogget Flatr akkurat nå – vises øverst til høyre.
export default function OnlineBar({ peers = [], selfId, connected }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const list = [...peers].sort((a, b) => {
    if (a.id === selfId) return -1;
    if (b.id === selfId) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });
  const inline = list.slice(0, 4);
  const rest = list.slice(4);

  return (
    <div ref={wrapRef} className="relative flex items-center gap-1.5">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${connected ? 'bg-ok' : 'bg-muted/50'}`}
        title={connected ? 'Tilkoblet' : 'Kobler til …'}
      />
      {list.length === 0 ? (
        <span className="text-xs text-muted">Ingen pålogget</span>
      ) : (
        inline.map((p) => (
          <span
            key={p.id}
            title={p.where || p.email || p.name}
            className="flex items-center gap-1.5 rounded-full border border-hair bg-paper px-2 py-0.5 text-xs"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: p.color || '#8b8d94' }}
            />
            <span className={p.id === selfId ? 'font-semibold text-ink' : 'text-ink'}>
              {p.name}
              {p.id === selfId ? ' (du)' : ''}
            </span>
          </span>
        ))
      )}
      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-hair bg-paper px-2 py-0.5 text-xs font-semibold text-muted hover:text-ink"
        >
          +{rest.length}
        </button>
      )}
      {open && rest.length > 0 && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-lg border border-hair bg-card p-1 shadow-pop">
          {rest.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: p.color || '#8b8d94' }}
              />
              <span className="truncate text-ink">{p.name}</span>
              {p.where && <span className="ml-auto shrink-0 text-muted">{p.where}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
