import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import FootballView from '../../../viewer/slides/FootballView.jsx';
import { Button, Input, IconButton } from '../ui.jsx';
import { Section, Dot } from './parts.jsx';

// Fotball: API-Football-nøkkel, lagene og ligaene som følges.

function Search({ appId, kind, onPick, chosen }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const search = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setHits(await api.apps.searchFootball(appId, kind, q.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === 'team' ? 'Søk etter lag, f.eks. Aalesund' : 'Søk etter liga, f.eks. Eliteserien'} />
        <Button type="submit" size="sm" disabled={busy || q.trim().length < 3}>
          {busy ? 'Søker …' : 'Søk'}
        </Button>
      </form>
      {error && <p className="m-0 mt-2 text-xs text-danger">{error}</p>}
      {hits?.length === 0 && <p className="m-0 mt-2 text-xs text-muted">Ingen treff (skriv minst tre bokstaver, gjerne på engelsk).</p>}
      {hits?.length > 0 && (
        <ul className="m-0 mt-2 max-h-60 list-none overflow-y-auto rounded-xl border border-hair p-1">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                disabled={chosen.has(h.id)}
                onClick={() => (onPick(h), setHits(null), setQ(''))}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zone disabled:opacity-50"
              >
                {h.logo && <img src={h.logo} alt="" className="h-5 w-5 object-contain" />}
                <span className="min-w-0 flex-1 truncate text-ink">{h.name}</span>
                <span className="text-xs text-muted">{[h.country, h.season].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FootballSettings({ app, onSaved }) {
  const [key, setKey] = useState('');
  const [edit, setEdit] = useState(!app.has_secret);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(null);
  const teams = app.config?.teams || [];
  const leagues = app.config?.leagues || [];

  useEffect(() => {
    if (app.has_secret && (teams.length || leagues.length)) api.apps.live(app.id).then(setLive).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.updated_at]);

  const update = async (body) => {
    setBusy(true);
    setError('');
    try {
      onSaved(await api.apps.update(app.id, body));
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 space-y-5">
        <Section icon="lock" title="API-Football-nøkkel" hint={edit ? 'Gratis på dashboard.api-football.com. Steg-for-steg under «Om appen».' : null} flush={!edit}>
          {edit ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await update({ api_key: key.trim() })) {
                  setKey('');
                  setEdit(false);
                }
              }}
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="API-nøkkel" autoComplete="off" className="h-10 rounded-xl border border-line bg-paper px-3 font-mono text-sm text-ink outline-none focus:border-focus" />
              <Button type="submit" disabled={busy || !key.trim()}>
                {busy ? 'Sjekker …' : 'Lagre nøkkel'}
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2 px-5 pb-4 text-sm">
              <Dot tone="ok" />
              <span className="text-ink">Tilkoblet</span>
              <span className="font-mono text-muted">· {app.config?.key_hint || 'lagret'}</span>
              <button type="button" onClick={() => setEdit(true)} className="ml-auto text-xs font-semibold text-brand hover:underline">
                Bytt
              </button>
            </div>
          )}
        </Section>
        {error && <p className="m-0 text-sm text-danger">{error}</p>}
        {app.has_secret && (
          <>
            <Section icon="users" title="Lag" count={teams.length} hint="Neste kamper og siste resultater. Maks fire lag.">
              <ul className="m-0 mb-3 list-none p-0">
                {teams.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 py-1.5 text-sm">
                    {t.logo && <img src={t.logo} alt="" className="h-5 w-5 object-contain" />}
                    <span className="flex-1 text-ink">{t.name}</span>
                    <IconButton name="x" label={`Fjern ${t.name}`} tone="danger" onClick={() => update({ config: { teams: teams.filter((x) => x.id !== t.id) } })} />
                  </li>
                ))}
              </ul>
              {teams.length < 4 && <Search appId={app.id} kind="team" chosen={new Set(teams.map((t) => t.id))} onPick={(h) => update({ config: { teams: [...teams, h] } })} />}
            </Section>
            <Section icon="chart" title="Ligaer" count={leagues.length} hint="Tabeller. Maks tre ligaer.">
              <ul className="m-0 mb-3 list-none p-0">
                {leagues.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 py-1.5 text-sm">
                    {l.logo && <img src={l.logo} alt="" className="h-5 w-5 object-contain" />}
                    <span className="flex-1 text-ink">
                      {l.name} <span className="text-muted">{l.season}</span>
                    </span>
                    <IconButton name="x" label={`Fjern ${l.name}`} tone="danger" onClick={() => update({ config: { leagues: leagues.filter((x) => x.id !== l.id) } })} />
                  </li>
                ))}
              </ul>
              {leagues.length < 3 && <Search appId={app.id} kind="league" chosen={new Set(leagues.map((l) => l.id))} onPick={(h) => update({ config: { leagues: [...leagues, h] } })} />}
            </Section>
          </>
        )}
      </div>
      <div className="min-w-0">
        {live && (
          <div className="sticky top-4 space-y-2">
            <div className="text-xs font-semibold text-muted">Forhåndsvisning</div>
            <div className="aspect-[16/10] w-full overflow-hidden rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #14532d, #052e16)', containerType: 'size' }}>
              <FootballView data={live} view={teams.length ? 'next' : 'table'} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
