import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import SheetView from '../../../viewer/slides/SheetView.jsx';
import { Button, IconButton, Input } from '../ui.jsx';
import { Section } from './parts.jsx';
import { tr } from '../../../lib/i18n.js';

// Regneark: lenkene til regnearkene kunden vil vise. Serveren henter et nytt
// regneark én gang når det legges til, så vi vet at lenken virker.

const MAX_SHEETS = 10;

export default function SheetSettings({ app, onSaved }) {
  const [sheets, setSheets] = useState(app.config?.sheets || []);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(null);
  const [shown, setShown] = useState(null);

  const loadLive = () => api.apps.live(app.id).then(setLive).catch(() => setLive(null));
  useEffect(() => {
    loadLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.updated_at]);

  const save = async (next) => {
    setError('');
    setBusy(true);
    try {
      const res = await api.apps.update(app.id, { config: { sheets: next } });
      setSheets(res.config.sheets);
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
    if (await save([...sheets, { url: url.trim(), name: name.trim() }])) {
      setUrl('');
      setName('');
    }
  };

  const current = sheets.find((s) => s.id === shown) || sheets[0];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 space-y-5">
        <Section icon="table" title={tr('Regneark')} count={sheets.length} hint={tr('Lim inn lenken til et Google-regneark (delt med «alle med linken»), en Excel-fil fra OneDrive («Bygg inn») eller en CSV-lenke.')}>
          <form onSubmit={add} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" disabled={sheets.length >= MAX_SHEETS} />
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('Navn (f.eks. Vaktliste)')} disabled={sheets.length >= MAX_SHEETS} />
            <Button type="submit" disabled={busy || !url.trim() || sheets.length >= MAX_SHEETS}>
              {busy ? tr('Henter …') : tr('Legg til')}
            </Button>
          </form>
          {error && <p className="m-0 mt-2 text-sm text-danger">{error}</p>}
          <ul className="m-0 mt-3 list-none divide-y divide-hair p-0">
            {sheets.map((s) => {
              const info = live?.sheets?.[s.id];
              return (
                <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                  <button type="button" onClick={() => setShown(s.id)} className={`min-w-0 flex-1 truncate text-left font-medium ${current?.id === s.id ? 'text-brand' : 'text-ink'}`}>
                    {s.name}
                  </button>
                  <span className={`shrink-0 text-xs ${info?.error ? 'text-danger' : 'text-muted'}`} title={info?.error || s.url}>
                    {info ? (info.error ? tr('Feil') : tr('{0} rader', [info.rows.length])) : ''}
                  </span>
                  <IconButton name="x" label={tr('Fjern {0}', [s.name])} tone="danger" onClick={() => save(sheets.filter((x) => x.id !== s.id))} />
                </li>
              );
            })}
          </ul>
          {!sheets.length && <p className="m-0 mt-2 text-sm text-muted">{tr('Ingen regneark ennå. Du kan legge til opptil')} {MAX_SHEETS}.</p>}
        </Section>
      </div>
      <div className="min-w-0">
        <div className="sticky top-4 space-y-2">
          <div className="text-xs font-semibold text-muted">{tr('Forhåndsvisning')}{current ? ` · ${current.name}` : ''}</div>
          <div className="aspect-[16/10] w-full overflow-hidden rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #14532d, #0f172a)', containerType: 'size' }}>
            {live && current ? <SheetView data={live} sheetId={current.id} max={8} /> : <p className="text-sm opacity-70">{sheets.length ? tr('Henter regnearket …') : tr('Legg til et regneark.')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
