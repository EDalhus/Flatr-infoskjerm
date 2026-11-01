import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import { MODE_LABEL } from '../../../lib/entur.js';
import DeparturesView from '../../../viewer/slides/DeparturesView.jsx';
import { Input, IconButton } from '../ui.jsx';
import { Section } from './parts.jsx';
import { tr } from '../../../lib/i18n.js';

// Avganger (Entur): holdeplassene kunden vil vise avganger fra. Søket går mot
// Enturs holdeplassregister; hvert element på et lysbilde velger én av dem.

const MAX_STOPS = 6;

export default function EnturSettings({ app, onSaved }) {
  const [stops, setStops] = useState(app.config?.stops || []);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const loadLive = () => api.apps.live(app.id).then(setLive).catch(() => setLive(null));
  useEffect(() => {
    loadLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.updated_at]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // Søk mens det skrives (litt forsinket).
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setHits([]);
      return undefined;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      api.apps
        .searchStops(app.id, text)
        .then((rows) => alive && setHits(rows || []))
        .catch((e) => alive && setError(e.message))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, app.id]);

  const save = async (next) => {
    setError('');
    try {
      const res = await api.apps.update(app.id, { config: { stops: next } });
      setStops(res.config.stops);
      onSaved(res);
    } catch (e) {
      setError(e.message);
    }
  };

  const add = (hit) => {
    setQ('');
    setHits([]);
    if (!stops.some((s) => s.id === hit.id)) save([...stops, { id: hit.id, name: hit.name }]);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 space-y-5">
        <Section icon="bus" title={tr('Holdeplasser')} count={stops.length} hint={tr('Søk opp holdeplassene i nærheten. Hvert element på et lysbilde viser én av dem.')}>
          <div>
            <Input
              id="entur-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr('Søk etter holdeplass, stasjon eller kai …')}
              disabled={stops.length >= MAX_STOPS}
              autoComplete="off"
            />
            {(hits.length > 0 || searching) && (
              <ul className="m-0 mt-1 max-h-72 list-none overflow-y-auto rounded-xl border border-line bg-card p-1">
                {searching && !hits.length && <li className="px-3 py-2 text-sm text-muted">{tr('Søker …')}</li>}
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => add(h)} className="flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zone">
                      <span className="font-semibold text-ink">{h.name}</span>
                      <span className="min-w-0 truncate text-xs text-muted">
                        {[h.place, h.modes.map((m) => MODE_LABEL[m] || m).join(', ')].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {error && <p className="m-0 mt-2 text-sm text-danger">{error}</p>}
          <ul className="m-0 mt-3 list-none divide-y divide-hair p-0">
            {stops.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{s.name}</span>
                <IconButton name="x" label={tr('Fjern {0}', [s.name])} tone="danger" onClick={() => save(stops.filter((x) => x.id !== s.id))} />
              </li>
            ))}
          </ul>
          {!stops.length && <p className="m-0 mt-2 text-sm text-muted">{tr('Ingen holdeplasser ennå. Du kan legge til opptil')} {MAX_STOPS}.</p>}
        </Section>
      </div>
      <div className="min-w-0">
        <div className="sticky top-4 space-y-2">
          <div className="text-xs font-semibold text-muted">{tr('Forhåndsvisning')}</div>
          <div className="aspect-[16/10] w-full overflow-hidden rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', containerType: 'size' }}>
            {live ? <DeparturesView data={live} max={6} now={now} /> : <p className="text-sm opacity-70">{stops.length ? tr('Henter avganger …') : tr('Legg til en holdeplass.')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
