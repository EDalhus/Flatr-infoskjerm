import { useEffect, useRef, useState } from 'react';

const initials = (name = '') =>
  name
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase() || '?';

function Avatar({ p, ring = true }) {
  return (
    <span
      className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${
        ring ? 'ring-2 ring-card' : ''
      }`}
      style={{ background: p.color || '#8b8d94' }}
    >
      {initials(p.name)}
    </span>
  );
}

// Andre som er pålogget akkurat nå (deg selv vises i brukermenyen). Skjult
// når du er alene. Samme person i flere faner telles én gang.
export default function OnlineBar({ peers = [], selfId }) {
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

  const self = peers.find((p) => p.id === selfId);
  const seen = new Set(self ? [self.name] : []);
  const others = [];
  for (const p of [...peers].sort((a, b) => (a.name || '').localeCompare(b.name || ''))) {
    if (p.id === selfId || seen.has(p.name)) continue;
    seen.add(p.name);
    others.push(p);
  }
  if (others.length === 0) return null;

  const shown = others.slice(0, 3);
  const label = `${others.length} ${others.length === 1 ? 'annen' : 'andre'} pålogget`;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="flex items-center -space-x-2 rounded-full p-0.5 hover:bg-hair"
      >
        {shown.map((p) => (
          <Avatar key={p.id} p={p} />
        ))}
        {others.length > shown.length && (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-hair text-xs font-semibold text-muted ring-2 ring-card">
            +{others.length - shown.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-line bg-card p-2 shadow-pop">
          <div className="px-2 pb-1.5 pt-1 text-xs font-semibold text-muted">Pålogget nå</div>
          {others.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm">
              <Avatar p={p} ring={false} />
              <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
              {p.where && <span className="shrink-0 text-xs text-muted">{p.where}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
