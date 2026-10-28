import { useState } from 'react';
import { api } from '../../../lib/api.js';
import { cleanStock, STOCK_GROUPS, PALLET_TYPES } from '../../../lib/stock.js';
import StockView from '../../../viewer/slides/StockView.jsx';
import { Input, Textarea, IconButton, Segmented } from '../ui.jsx';
import { Section, SaveBar } from './parts.jsx';

// Lagerbeholdning: varene skrives inn for hånd. Forhåndsvisningen viser
// boksen slik den blir på skjermene.

const newId = () => Math.random().toString(36).slice(2, 10);
const UNIT_HINTS = ['tonn', 'kg', 'big bags', 'sekker', 'paller', 'stk', 'm³', 'liter'];

// Detaljer redigeres som tekst (én per linje); lagres som liste.
const toForm = (c) => ({
  title: c?.title || '',
  location: c?.location || '',
  items: (c?.items || []).map((it) => ({ ...it, group: it.group || 'bulk', details: (it.details || []).join('\n'), min: it.min || '' }))
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

  const edit = (id, patch) => setF((x) => ({ ...x, items: x.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  const remove = (id) => setF((x) => ({ ...x, items: x.items.filter((it) => it.id !== id) }));
  // Flytt innenfor gruppen: bytt plass med forrige/neste vare i samme gruppe.
  const move = (id, d) =>
    setF((x) => {
      const items = [...x.items];
      const i = items.findIndex((it) => it.id === id);
      const same = items.map((it, j) => (it.group === items[i].group ? j : -1)).filter((j) => j >= 0);
      const j = same[same.indexOf(i) + d];
      if (j === undefined) return x;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...x, items };
    });
  const add = (g) =>
    setF((x) => {
      const last = [...x.items].reverse().find((it) => it.group === g.id);
      const item = { id: newId(), group: g.id, pallet: g.id === 'pallets' ? 'EP' : null, name: '', amount: '', unit: last?.unit || g.unit, details: '', min: '' };
      return { ...x, items: [...x.items, item] };
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
        {STOCK_GROUPS.map((g) => {
          const list = f.items.filter((it) => it.group === g.id);
          return (
            <Section
              key={g.id}
              icon="layers"
              title={g.label}
              count={list.length}
              hint={g.id === 'bulk' ? 'Skjermene oppdateres med en gang du lagrer. Tall som 1052,44 vises som 1 052,44.' : g.id === 'pallets' ? 'Velg EP (Europalle) eller SRS for hver vare.' : null}
            >
              <div className="grid gap-3">
                {list.map((it, k) => (
                  <div key={it.id} className="grid gap-2 rounded-xl border border-hair bg-paper p-3">
                    <div className="flex items-center gap-2">
                      {g.id === 'pallets' && (
                        <Segmented value={it.pallet || 'EP'} onChange={(v) => edit(it.id, { pallet: v })} options={PALLET_TYPES.map((p) => ({ value: p.id, label: p.label }))} />
                      )}
                      <Input value={it.name} onChange={(e) => edit(it.id, { name: e.target.value })} placeholder="Navn på varen" className="font-semibold" />
                      <IconButton name="up" label="Flytt opp" onClick={() => move(it.id, -1)} disabled={k === 0} />
                      <IconButton name="down" label="Flytt ned" onClick={() => move(it.id, 1)} disabled={k === list.length - 1} />
                      <IconButton name="x" label="Fjern varen" tone="danger" onClick={() => remove(it.id)} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <label className="grid gap-1 text-xs font-semibold text-muted">
                        På lager
                        <Input value={it.amount} onChange={(e) => edit(it.id, { amount: e.target.value })} placeholder="Antall" inputMode="decimal" className="tabular-nums" />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-muted">
                        Enhet
                        <Input value={it.unit} onChange={(e) => edit(it.id, { unit: e.target.value })} placeholder={g.unit} list="stock-units" />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-muted">
                        Varsle under (valgfritt)
                        <Input value={it.min} onChange={(e) => edit(it.id, { min: e.target.value })} placeholder="Ingen varsel" inputMode="decimal" className="tabular-nums" />
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs font-semibold text-muted">
                      Detaljer (valgfritt, én per linje, f.eks. silo eller lagerplass)
                      <Textarea rows={2} value={it.details} onChange={(e) => edit(it.id, { details: e.target.value })} placeholder="Tomt = ingen detaljer" />
                    </label>
                  </div>
                ))}
                <button type="button" onClick={() => add(g)} className="justify-self-start text-sm font-semibold text-brand hover:underline">
                  + Legg til i {g.label.toLowerCase()}
                </button>
              </div>
            </Section>
          );
        })}
        <datalist id="stock-units">
          {UNIT_HINTS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <Section icon="edit" title="Overskrift og sted">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-muted">
              Overskrift
              <Input value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} placeholder="Standard: Lagerbeholdning" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted">
              Sted (valgfritt)
              <Input value={f.location} onChange={(e) => setF((x) => ({ ...x, location: e.target.value }))} placeholder="F.eks. Ålesund" />
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
