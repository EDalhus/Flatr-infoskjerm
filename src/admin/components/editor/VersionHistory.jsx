// Versjonshistorikk for en presentasjon (src/api/versions.js): se tidligere
// versjoner og gjenopprett. Nåværende innhold lagres som egen versjon først,
// så en gjenoppretting kan alltid angres.

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import SlideThumb from '../deck/SlideThumb.jsx';
import { Icon, Button } from '../ui.jsx';

const KIND = { published: 'Publisert', before_restore: 'Før gjenoppretting', restore: 'Gjenopprettet' };

function when(iso) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  const clock = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  if (min < 1) return 'Nå nettopp';
  if (min < 60) return `${min} min siden`;
  if (d.toDateString() === new Date().toDateString()) return `I dag ${clock}`;
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return `I går ${clock}`;
  return `${d.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })} ${clock}`;
}

export default function VersionHistory({ playlistId, orientation, onClose, onRestored, readOnly }) {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null); // full versjon
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.versions
      .list(playlistId)
      .then(setList)
      .catch((e) => setError(e.message));
  }, [playlistId]);

  const show = async (v) => {
    setError('');
    try {
      setOpen(await api.versions.get(v.id));
    } catch (e) {
      setError(e.message);
    }
  };

  const restore = async (v) => {
    if (!confirm(`Gjenopprette versjonen fra ${when(v.created_at).toLowerCase()}? Slik presentasjonen ser ut nå, lagres som egen versjon, så du kan angre.`)) return;
    setBusy(true);
    setError('');
    try {
      await api.versions.restore(v.id);
      onRestored?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col border-l border-line bg-card shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="m-0 text-base font-bold text-ink">Versjonshistorikk</h2>
            <p className="m-0 text-xs text-muted">Lagres automatisk når du har jobbet en stund.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-zone" aria-label="Lukk">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </header>
        {error && <p className="m-3 rounded-lg bg-danger-tint px-3 py-2 text-xs text-danger">{error}</p>}

        {open ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <button type="button" onClick={() => setOpen(null)} className="mb-3 text-sm font-semibold text-brand hover:underline">
              ← Alle versjoner
            </button>
            <div className="mb-3 text-sm text-ink">
              <strong>{when(open.created_at)}</strong>
              {open.author && <span className="text-muted"> · {open.author}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {open.deck.slides.map((s) => (
                <div key={s.id}>
                  <SlideThumb slide={s} orientation={open.deck.orientation || orientation} />
                  <div className="mt-1 truncate text-xs text-muted">{s.name || 'Lysbilde'}</div>
                </div>
              ))}
            </div>
            {!readOnly && (
              <Button className="mt-4 w-full" onClick={() => restore(open)} disabled={busy}>
                {busy ? 'Gjenoppretter …' : 'Gjenopprett denne versjonen'}
              </Button>
            )}
          </div>
        ) : (
          <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-2">
            {list === null && <li className="p-4 text-sm text-muted">Laster …</li>}
            {list?.length === 0 && <li className="p-4 text-sm text-muted">Ingen versjoner ennå. Den første lagres litt etter at du har gjort endringer.</li>}
            {list?.map((v, i) => (
              <li key={v.id}>
                <button type="button" onClick={() => show(v)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-zone">
                  <div className="w-28 shrink-0">{v.preview ? <SlideThumb slide={v.preview} orientation={orientation} /> : <div className="aspect-video rounded bg-zone" />}</div>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-semibold text-ink">
                      {when(v.created_at)}
                      {i === 0 && <span className="ml-1.5 rounded-full bg-zone px-1.5 py-0.5 text-[10px] font-semibold text-muted">Siste</span>}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {[v.author, `${v.slide_count} lysbilde${v.slide_count === 1 ? '' : 'r'}`].filter(Boolean).join(' · ')}
                    </div>
                    {(KIND[v.kind] || v.published) && (
                      <div className="mt-1 flex gap-1">
                        {v.published && <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold text-brand">På skjermene</span>}
                        {KIND[v.kind] && v.kind !== 'published' && <span className="rounded-full bg-zone px-1.5 py-0.5 text-[10px] font-semibold text-muted">{KIND[v.kind]}</span>}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
