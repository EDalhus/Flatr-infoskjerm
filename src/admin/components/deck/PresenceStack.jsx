// Avatar-stabel: hvem andre er inne i kanal-editoren akkurat nå.
const initials = (name = '') =>
  name
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase() || '?';

export default function PresenceStack({ peers = [], connected, className = '' }) {
  const shown = peers.slice(0, 5);
  const extra = peers.length - shown.length;

  return (
    <div className={`flex items-center gap-2 ${className}`} title={connected ? 'Live' : 'Kobler til …'}>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${connected ? 'bg-ok' : 'bg-muted/50'}`}
      />
      {peers.length === 0 ? (
        <span className="text-xs text-muted">Bare deg</span>
      ) : (
        <div className="flex -space-x-1.5">
          {shown.map((p) => (
            <span
              key={p.id}
              title={p.name}
              className="grid h-6 w-6 place-items-center rounded-full border-2 border-card text-[10px] font-bold text-white"
              style={{ background: p.color || '#8b8d94' }}
            >
              {initials(p.name)}
            </span>
          ))}
          {extra > 0 && (
            <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-card bg-hair text-[10px] font-bold text-muted">
              +{extra}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
