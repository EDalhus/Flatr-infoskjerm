import { FeedMessage } from './useFeed.jsx';
import { formatAmount, isLow } from '../../lib/stock.js';

// Lagerbeholdning (Flatr-appen): én rad per vare med mengde, valgfrie
// detaljlinjer og varsel under minstebeholdningen. Samme stil som anløpstavla.

function updatedText(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const clock = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Oppdatert i dag ${clock}`;
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return `Oppdatert i går ${clock}`;
  return `Oppdatert ${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace('.', '')} ${clock}`;
}

export default function StockView({ data, title, showUpdated = true, showDetails = true }) {
  const items = data?.items || [];
  if (!items.length) return <FeedMessage>Ingen varer lagt inn ennå</FeedMessage>;
  // Høyden i «linjer»: navnelinje per vare + én linje per detalj (mindre skrift).
  const lines = items.reduce((n, it) => n + 1.9 + (showDetails ? 0.9 * it.details.length : 0), 0) + items.length * 0.5;
  const updated = showUpdated ? updatedText(data.updated_at) : null;
  return (
    <div className="flex h-full w-full flex-col" style={{ fontSize: `min(${(100 / (lines + 3)).toFixed(2)}cqh, 3cqw)` }}>
      <div className="mb-[0.5em] flex items-baseline gap-[0.5em] font-bold" style={{ fontSize: '1.35em' }}>
        <span className="truncate">{title || data.title || 'Lagerbeholdning'}</span>
        {data.location && (
          <span className="truncate font-medium opacity-60" style={{ fontSize: '0.7em' }}>
            {data.location}
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[0.4em]">
        {items.map((it) => {
          const low = isLow(it);
          return (
            <div
              key={it.id}
              className="flex shrink-0 items-center gap-[0.8em] rounded-[0.5em] px-[0.8em] py-[0.5em]"
              style={{ background: low ? 'rgba(245,158,11,0.22)' : 'rgba(0,0,0,0.28)' }}
            >
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate font-bold">{it.name}</div>
                {showDetails && it.details.length > 0 && (
                  <div className="mt-[0.15em] grid opacity-75" style={{ fontSize: '0.75em' }}>
                    {it.details.map((d, i) => (
                      <span key={i} className="truncate">
                        {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right leading-tight">
                <div className="whitespace-nowrap font-bold tabular-nums">
                  {formatAmount(it.amount) || '–'}
                  {it.unit && <span className="ml-[0.3em] font-medium opacity-75">{it.unit}</span>}
                </div>
                {low && (
                  <div className="font-semibold text-amber-300" style={{ fontSize: '0.7em' }}>
                    Lav beholdning
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {updated && (
        <div className="mt-[0.4em] shrink-0 opacity-50" style={{ fontSize: '0.6em' }}>
          {updated}
        </div>
      )}
    </div>
  );
}
