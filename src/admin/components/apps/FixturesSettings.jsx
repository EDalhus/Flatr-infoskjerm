import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import { MAX_TEAMS } from '../../../lib/fixtures.js';
import FixturesView from '../../../viewer/slides/FixturesView.jsx';
import { Button, IconButton, Input } from '../ui.jsx';
import { Section } from './parts.jsx';
import { tr } from '../../../lib/i18n.js';

// Kampprogram: lagenes kalenderlenker fra fotball.no og handball.no.
// Serveren henter kalenderen når et lag legges til, så vi vet at lenken virker
// og hva laget heter.

export default function FixturesSettings({ app, onSaved }) {
  const [teams, setTeams] = useState(app.config?.teams || []);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(null);

  const loadLive = () => api.apps.live(app.id).then(setLive).catch(() => setLive(null));
  useEffect(() => {
    loadLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.updated_at]);

  const save = async (next) => {
    setError('');
    setBusy(true);
    try {
      const res = await api.apps.update(app.id, { config: { teams: next } });
      setTeams(res.config.teams);
      onSaved(res);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    if (await save([...teams, { url: url.trim() }])) setUrl('');
  };

  const rename = (id, name) => setTeams((list) => list.map((t) => (t.id === id ? { ...t, name } : t)));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 space-y-5">
        <Section
          icon="calendar"
          title={tr('Lagene')}
          count={teams.length}
          hint={tr('Lim inn lenken fra «Abonner på kalender» på lagets side på fotball.no eller handball.no (under Kamper).')}
        >
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <Input
              id="fixtures-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.fotball.no/footballapi/Calendar/GetCalendar?teamId=…"
              className="min-w-0 flex-1"
              disabled={teams.length >= MAX_TEAMS}
            />
            <Button type="submit" disabled={busy || !url.trim() || teams.length >= MAX_TEAMS}>
              {busy ? tr('Henter …') : tr('Legg til lag')}
            </Button>
          </form>
          {error && <p className="m-0 mt-2 text-sm text-danger">{error}</p>}
          <ul className="m-0 mt-3 list-none divide-y divide-hair p-0">
            {teams.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                <Input
                  value={t.name}
                  onChange={(e) => rename(t.id, e.target.value)}
                  onBlur={() => save(teams)}
                  aria-label={tr('Navn på skjermen')}
                  className="!h-8 max-w-[14rem]"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-muted" title={t.url}>
                  {t.calname || new URL(t.url).hostname}
                </span>
                <IconButton name="x" label={tr('Fjern {0}', [t.name])} tone="danger" onClick={() => save(teams.filter((x) => x.id !== t.id))} />
              </li>
            ))}
          </ul>
          {!teams.length && <p className="m-0 mt-2 text-sm text-muted">{tr('Ingen lag ennå. Legg til A-laget, eller alle lagene i klubben – opptil')} {MAX_TEAMS}.</p>}
          {live?.errors?.length > 0 && <p className="m-0 mt-2 text-sm text-danger">{live.errors.join(' · ')}</p>}
        </Section>
      </div>
      <div className="min-w-0">
        <div className="sticky top-4 space-y-2">
          <div className="text-xs font-semibold text-muted">{tr('Forhåndsvisning')}</div>
          <div className="aspect-[16/10] w-full overflow-hidden rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #0e4d64, #082f3d)', containerType: 'size' }}>
            {live ? <FixturesView data={live} view="list" max={5} /> : <p className="text-sm opacity-70">{teams.length ? tr('Henter kamper …') : tr('Legg til et lag.')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
