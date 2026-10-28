import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import { PlaceSearch } from '../deck/ElementConfigFields.jsx';
import TidesView from '../../../viewer/slides/TidesView.jsx';
import { IconButton } from '../ui.jsx';
import { Section } from './parts.jsx';

// Tidevann og sjø: steder langs kysten. Data hentes fra Kartverket og MET.

export default function TidesSettings({ app, onSaved }) {
  const [places, setPlaces] = useState(app.config?.places || []);
  const [live, setLive] = useState(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(places[0]?.id || null);

  const loadLive = () => api.apps.live(app.id).then(setLive).catch(() => {});
  useEffect(() => {
    loadLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.updated_at]);

  const save = async (next) => {
    setError('');
    try {
      const res = await api.apps.update(app.id, { config: { places: next } });
      setPlaces(res.config.places);
      onSaved(res);
      return res.config.places;
    } catch (e) {
      setError(e.message);
      return null;
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 space-y-5">
        <Section icon="pin" title="Steder" count={places.length} hint="Søk opp en havn eller et sted langs kysten. Tidevann finnes for hele norskekysten; bølger og sjøtemperatur for punkter i sjøen.">
          <PlaceSearch
            placeholder="Søk etter sted, f.eks. Ålesund"
            onPick={async (h) => {
              const list = await save([...places, { name: h.name, lat: h.lat, lon: h.lon }]);
              if (list?.length) setPreview(list[list.length - 1].id);
            }}
          />
          {error && <p className="m-0 mt-2 text-sm text-danger">{error}</p>}
          <ul className="m-0 mt-3 list-none divide-y divide-hair p-0">
            {places.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                <button type="button" onClick={() => setPreview(p.id)} className={`min-w-0 flex-1 truncate text-left font-medium ${preview === p.id ? 'text-brand' : 'text-ink'}`}>
                  {p.name}
                </button>
                <span className="font-mono text-xs text-muted">
                  {p.lat.toFixed(3)}, {p.lon.toFixed(3)}
                </span>
                <IconButton name="x" label={`Fjern ${p.name}`} tone="danger" onClick={() => save(places.filter((x) => x.id !== p.id))} />
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <div className="min-w-0">
        <div className="sticky top-4 space-y-2">
          <div className="text-xs font-semibold text-muted">Forhåndsvisning</div>
          <div className="aspect-[16/10] w-full overflow-hidden rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #0e4d64, #082f3d)', containerType: 'size' }}>
            {live?.places?.[preview] ? <TidesView place={live.places[preview]} /> : <p className="text-sm opacity-70">{places.length ? 'Henter data …' : 'Legg til et sted.'}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
