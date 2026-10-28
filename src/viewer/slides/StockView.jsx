import { FeedMessage } from './useFeed.jsx';
import { STOCK_GROUPS, formatAmount, isLow, groupTotal } from '../../lib/stock.js';

// Lagerbeholdning (Flatr-appen): varene delt i Bulk, Big bags og Paller, hver
// gruppe med egen overskrift (og sum når enhetene er like). Én rad per vare med
// mengde, valgfrie detaljlinjer, palletype og varsel under minstebeholdningen.
// Samme stil som anløpstavla.

function updatedText(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const clock = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Oppdatert i dag ${clock}`;
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return `Oppdatert i går ${clock}`;
  return `Oppdatert ${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace('.', '')} ${clock}`;
}

function Amount({ amount, unit }) {
  return (
    <span className="whitespace-nowrap font-bold tabular-nums">
      {formatAmount(amount) || '–'}
      {unit && <span className="ml-[0.3em] font-medium opacity-75">{unit}</span>}
    </span>
  );
}

function Row({ it, showDetails }) {
  const low = isLow(it);
  return (
    <div className="flex shrink-0 items-center gap-[0.8em] rounded-[0.5em] px-[0.8em] py-[0.45em]" style={{ background: low ? 'rgba(245,158,11,0.22)' : 'rgba(0,0,0,0.28)' }}>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex min-w-0 items-center gap-[0.45em]">
          {it.pallet && (
            <span className="shrink-0 rounded-[0.3em] px-[0.4em] py-[0.05em] font-bold" style={{ fontSize: '0.62em', letterSpacing: '0.04em', background: it.pallet === 'SRS' ? 'rgba(56,189,248,0.25)' : 'rgba(255,255,255,0.16)' }}>
              {it.pallet}
            </span>
          )}
          <span className="truncate font-bold">{it.name}</span>
        </div>
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
        <Amount amount={it.amount} unit={it.unit} />
        {low && (
          <div className="font-semibold text-amber-300" style={{ fontSize: '0.7em' }}>
            Lav beholdning
          </div>
        )}
      </div>
    </div>
  );
}

export default function StockView({ data, title, groups: only, showUpdated = true, showDetails = true }) {
  const wanted = Array.isArray(only) && only.length ? new Set(only) : null;
  const items = (data?.items || []).filter((it) => !wanted || wanted.has(it.group || 'bulk'));
  if (!items.length) return <FeedMessage>Ingen varer lagt inn ennå</FeedMessage>;
  const groups = STOCK_GROUPS.map((g) => ({ ...g, items: items.filter((it) => (it.group || 'bulk') === g.id) })).filter((g) => g.items.length);
  const updated = showUpdated ? updatedText(data.updated_at) : null;
  // Høyden målt i em, så alt får plass: tittel, gruppeoverskrifter, rader (med
  // detaljlinjer eller «Lav beholdning» under), mellomrom og «Oppdatert».
  const rowEm = (it) => {
    const details = showDetails ? it.details.length : 0;
    return 2.5 + Math.max(details * 0.95, isLow(it) ? 0.9 : 0);
  };
  const em = 2.2 + groups.length * 1.9 + items.reduce((n, it) => n + rowEm(it), 0) + (updated ? 1.2 : 0);
  return (
    <div className="flex h-full w-full flex-col overflow-hidden" style={{ fontSize: `min(${(100 / em).toFixed(2)}cqh, 3cqw)` }}>
      <div className="mb-[0.4em] flex items-baseline gap-[0.5em] font-bold" style={{ fontSize: '1.35em' }}>
        <span className="truncate">{title || data.title || 'Lagerbeholdning'}</span>
        {data.location && (
          <span className="truncate font-medium opacity-60" style={{ fontSize: '0.7em' }}>
            {data.location}
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[0.7em]">
        {groups.map((g) => {
          const total = groupTotal(g.items);
          return (
            <section key={g.id} className="flex shrink-0 flex-col gap-[0.35em]">
              <div className="flex items-baseline gap-[0.6em] border-b border-white/15 pb-[0.2em] font-bold uppercase" style={{ fontSize: '0.72em', letterSpacing: '0.1em' }}>
                <span className="opacity-80">{g.label}</span>
                {total && (
                  <span className="ml-auto normal-case opacity-70" style={{ letterSpacing: 0 }}>
                    Totalt <Amount amount={total.amount} unit={total.unit} />
                  </span>
                )}
              </div>
              {g.items.map((it) => (
                <Row key={it.id} it={it} showDetails={showDetails} />
              ))}
            </section>
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
