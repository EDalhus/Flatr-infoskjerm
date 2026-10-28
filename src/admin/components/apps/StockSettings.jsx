import { useState } from 'react';
import { api } from '../../../lib/api.js';
import { cleanStock } from '../../../lib/stock.js';
import StockView from '../../../viewer/slides/StockView.jsx';
import { Input, Textarea, IconButton } from '../ui.jsx';
import { Section, SaveBar } from './parts.jsx';

// Lagerbeholdning: varene skrives inn for hånd. Forhåndsvisningen viser
// boksen slik den blir på skjermene.

const newId = () => Math.random().toString(36).slice(2, 10);
const UNIT_HINTS = ['tonn', 'kg', 'big bags', 'sekker', 'paller', 'stk', 'm³', 'liter'];

// Detaljer redigeres som tekst (én per linje); lagres som liste.
const toForm = (c) => ({
  title: c?.title || '',
  location: c?.location || '',
  items: (c?.items || []).map((it) => ({ ...it, details: (it.details || []).join('\n'), min: it.min || '' }))
});
const fromForm = (f) => ({
  title: f.title,
  location: f.location,
  items: f.items.map((it) => ({ ...it, details: it.details.split('\n') }))
});

export default function StockSettings({ app, onSaved }) {
  const initial = toForm(app.config);
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const dirty = JSON.stringify(f) !== saved;

  const edit = (i, patch) => setF((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const move = (i, d) =>
    setF((x) => {
      const items = [...x.items];
      const j = i + d;
      if (j < 0 || j >= items.length) return x;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...x, items };
    });

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.apps.update(app.id, { config: fromForm(f) });
      onSaved(res);
      const next = toForm(res.config);
      setF(next);
      setSaved(JSON.stringify(next));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const preview = { ...cleanStock(fromForm(f)), updated_at: app.config?.updated_at || new Date().toISOString() };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
      <div className="min-w-0 space-y-5">
        <Section icon="layers" title="Varer" count={f.items.length} hint="Skjermene oppdateres med en gang du lagrer. Tall som «1052,44» vises som «1 052,44».">
          <div className="grid gap-3">
            {f.items.map((it, i) => (
              <div key={it.id} className="grid gap-2 rounded-xl border border-hair bg-paper p-3">
                <div className="flex items-center gap-2">
                  <Input value={it.name} onChange={(e) => edit(i, { name: e.target.value })} placeholder="Vare, f.eks. Icebreaker Rock" className="font-semibold" />
                  <IconButton name="up" label="Flytt opp" onClick={() => move(i, -1)} disabled={i === 0} />
                  <IconButton name="down" label="Flytt ned" onClick={() => move(i, 1)} disabled={i === f.items.length - 1} />
                  <IconButton name="x" label="Fjern varen" tone="danger" onClick={() => setF((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))} />
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="grid gap-1 text-xs font-semibold text-muted">
                    På lager
                    <Input value={it.amount} onChange={(e) => edit(i, { amount: e.target.value })} placeholder="3580" inputMode="decimal" className="tabular-nums" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted">
                    Enhet
                    <Input value={it.unit} onChange={(e) => edit(i, { unit: e.target.value })} placeholder="tonn" list="stock-units" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted">
                    Varsle under (valgfritt)
                    <Input value={it.min} onChange={(e) => edit(i, { min: e.target.value })} placeholder="500" inputMode="decimal" className="tabular-nums" />
                  </label>
                </div>
                <label className="grid gap-1 text-xs font-semibold text-muted">
                  Detaljer (valgfritt, én per linje)
                  <Textarea rows={2} value={it.details} onChange={(e) => edit(i, { details: e.target.value })} placeholder={'Silo 2: 1 200 tonn\nLager B: 2 380 tonn'} />
                </label>
              </div>
            ))}
            <datalist id="stock-units">
              {UNIT_HINTS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => setF((x) => ({ ...x, items: [...x.items, { id: newId(), name: '', amount: '', unit: x.items.at(-1)?.unit || '', details: '', min: '' }] }))}
              className="justify-self-start text-sm font-semibold text-brand hover:underline"
            >
              + Legg til vare
            </button>
          </div>
        </Section>
        <Section icon="edit" title="Overskrift og sted">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-muted">
              Overskrift
              <Input value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} placeholder="Lagerbeholdning" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted">
              Sted (valgfritt)
              <Input value={f.location} onChange={(e) => setF((x) => ({ ...x, location: e.target.value }))} placeholder="Ålesund" />
            </label>
          </div>
        </Section>
      </div>
      <div className="min-w-0">
        <div className="sticky top-4 space-y-2">
          <div className="text-xs font-semibold text-muted">Forhåndsvisning</div>
          <div className="aspect-[16/9] w-full overflow-hidden rounded-2xl p-6 text-white" style={{ background: '#0f172a', containerType: 'size' }}>
            <StockView data={preview} />
          </div>
        </div>
      </div>
      <SaveBar dirty={dirty} busy={busy} error={error} onSave={save} onDiscard={() => setF(JSON.parse(saved))} />
    </div>
  );
}
