import { useState } from 'react';
import { api } from '../../../lib/api.js';
import { MENU_DAYS, weekdayIn } from '../../../lib/menu.js';
import MenuView from '../../../viewer/slides/MenuView.jsx';
import { Input, IconButton } from '../ui.jsx';
import { Section, SaveBar } from './parts.jsx';

// Dagens meny: ukemenyen dag for dag. Forhåndsvisningen viser valgt dag.

// Merking skrives som tekst mens du redigerer; visningen vil ha en liste.
const normWeek = (week) =>
  Object.fromEntries(
    Object.entries(week).map(([d, list]) => [
      d,
      (list || []).filter((x) => x.name?.trim()).map((x) => ({ ...x, tags: Array.isArray(x.tags) ? x.tags : String(x.tags || '').split(',').map((t) => t.trim()).filter(Boolean) }))
    ])
  );

const TAG_HINTS = ['V', 'VG', 'G', 'L', 'Gluten', 'Laktose', 'Nøtter', 'Fisk', 'Skalldyr'];

export default function MenuSettings({ app, onSaved }) {
  const initial = { week: app.config?.week || {}, note: app.config?.note || '', weekend: !!app.config?.weekend };
  const [m, setM] = useState(initial);
  const [day, setDay] = useState(Math.min(weekdayIn('Europe/Oslo'), m.weekend ? 7 : 5));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const dirty = JSON.stringify(m) !== saved;

  const dishes = m.week[day] || [];
  const setDishes = (list) => setM((x) => ({ ...x, week: { ...x.week, [day]: list } }));
  const edit = (i, patch) => setDishes(dishes.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const days = MENU_DAYS.filter(([d]) => m.weekend || d <= 5);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const week = Object.fromEntries(
        Object.entries(m.week).map(([d, list]) => [d, (list || []).filter((x) => x.name?.trim()).map((x) => ({ ...x, tags: typeof x.tags === 'string' ? x.tags.split(',') : x.tags }))])
      );
      const res = await api.apps.update(app.id, { config: { week, note: m.note, weekend: m.weekend } });
      onSaved(res);
      const next = { week: res.config.week, note: res.config.note || '', weekend: !!res.config.weekend };
      setM(next);
      setSaved(JSON.stringify(next));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
      <div className="min-w-0 space-y-5">
        <Section icon="calendar" title="Ukemeny" hint="Skjermene viser dagens retter automatisk. Merking skilles med komma, f.eks. «V, G».">
          <div className="mb-4 flex flex-wrap items-center gap-1">
            {days.map(([d, name]) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${day === d ? 'bg-brand text-onbrand' : 'bg-zone text-muted hover:text-ink'}`}
              >
                {name}
                {(m.week[d] || []).length > 0 && <span className="ml-1 opacity-70">{m.week[d].length}</span>}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={m.weekend} onChange={(e) => setM((x) => ({ ...x, weekend: e.target.checked }))} /> Helg
            </label>
          </div>

          <div className="grid gap-3">
            {dishes.map((d, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-hair bg-paper p-3">
                <div className="flex items-center gap-2">
                  <Input value={d.name} onChange={(e) => edit(i, { name: e.target.value })} placeholder="Rett, f.eks. Fiskesuppe" className="font-semibold" />
                  <Input value={d.price || ''} onChange={(e) => edit(i, { price: e.target.value })} placeholder="Pris" className="!w-24" />
                  <IconButton name="x" label="Fjern retten" tone="danger" onClick={() => setDishes(dishes.filter((_, j) => j !== i))} />
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
                  <Input value={d.desc || ''} onChange={(e) => edit(i, { desc: e.target.value })} placeholder="Beskrivelse (valgfritt)" />
                  <Input
                    value={Array.isArray(d.tags) ? d.tags.join(', ') : d.tags || ''}
                    onChange={(e) => edit(i, { tags: e.target.value })}
                    placeholder="Merking: V, G, L …"
                    list="menu-tags"
                  />
                </div>
              </div>
            ))}
            <datalist id="menu-tags">
              {TAG_HINTS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-3 text-sm font-semibold">
              <button type="button" onClick={() => setDishes([...dishes, { name: '', price: '', desc: '', tags: [] }])} className="text-brand hover:underline">
                + Legg til rett
              </button>
              {day !== 1 && (m.week[1] || []).length > 0 && (
                <button type="button" onClick={() => setDishes((m.week[1] || []).map((x) => ({ ...x })))} className="text-muted hover:text-ink">
                  Kopier fra mandag
                </button>
              )}
            </div>
          </div>
        </Section>
        <Section icon="edit" title="Fast tekst under menyen (valgfritt)">
          <Input value={m.note} onChange={(e) => setM((x) => ({ ...x, note: e.target.value }))} placeholder="F.eks. «Spør kantina om allergener» eller «Salatbar hver dag»" />
        </Section>
      </div>
      <div className="min-w-0">
        <div className="sticky top-4 space-y-2">
          <div className="text-xs font-semibold text-muted">Forhåndsvisning – {MENU_DAYS.find(([d]) => d === day)?.[1].toLowerCase()}</div>
          <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #3b2416, #1c120b)', containerType: 'size' }}>
            <MenuView data={{ week: normWeek(m.week), today: day, note: m.note }} />
          </div>
        </div>
      </div>
      <SaveBar dirty={dirty} busy={busy} error={error} onSave={save} onDiscard={() => setM(JSON.parse(saved))} />
    </div>
  );
}
