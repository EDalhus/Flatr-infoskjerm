import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Input, Button } from './ui.jsx';

function Modal({ onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-hair bg-card shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

const isVideo = (m) => (m.content_type || '').startsWith('video/');

// `kind`: 'image' (standard) | 'video' – hvilke filer som kan velges.
export function MediaPicker({ onPick, onClose, kind = 'image' }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  // Unsplash bildebank (Flatr App): egen fane når appen er satt opp.
  const [unsplash, setUnsplash] = useState(null);
  const [tab, setTab] = useState('library');
  const [photos, setPhotos] = useState(null);
  const [importing, setImporting] = useState(null);
  useEffect(() => {
    if (kind !== 'image') return;
    api.apps
      .list()
      .then((rows) => setUnsplash((rows || []).find((a) => a.kind === 'unsplash' && a.has_secret) || null))
      .catch(() => {});
  }, [kind]);
  const searchPhotos = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError('');
    try {
      setPhotos(await api.apps.searchPhotos(unsplash.id, query.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const pickPhoto = async (p) => {
    setImporting(p.id);
    setError('');
    try {
      const m = await api.apps.importPhoto(p.id);
      onPick(api.media.url(m.id), m);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(null);
    }
  };

  const load = () =>
    api.media
      .list()
      .then((rows) => {
        setItems(rows || []);
        setError('');
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      for (const f of files) await api.media.upload(f, folder || undefined);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const ofKind = items.filter((m) => (kind === 'video' ? isVideo(m) : !isVideo(m)));
  const folders = [...new Set(ofKind.map((m) => m.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'));
  const q = query.trim().toLowerCase();
  const shown = ofKind.filter((m) => (!folder || m.folder === folder) && (!q || m.name.toLowerCase().includes(q)));

  return (
    <Modal onClose={onClose}>
      <header className="flex items-center justify-between border-b border-hair px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-ink">{kind === 'video' ? 'Velg video' : 'Velg bilde'}</h2>
          {unsplash && (
            <div className="flex rounded-full bg-zone p-0.5 text-xs font-semibold">
              {[
                ['library', 'Biblioteket'],
                ['unsplash', 'Unsplash']
              ].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-3 py-1 ${tab === id ? 'bg-card text-ink shadow-card' : 'text-muted hover:text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={kind === 'video' ? 'video/*' : 'image/*'}
            multiple
            hidden
            onChange={(e) => upload([...e.target.files])}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            {busy ? 'Laster opp …' : 'Last opp'}
          </Button>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-hair">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {error && (
          <p className="mb-3 rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {tab === 'unsplash' ? (
          <>
            <form onSubmit={searchPhotos} className="mb-4 flex items-center gap-2">
              <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
              <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søk i Unsplash, f.eks. «fjord vinter» eller «kontor»" />
              <Button type="submit" size="sm" disabled={busy || !query.trim()}>
                {busy ? 'Søker …' : 'Søk'}
              </Button>
            </form>
            {photos === null ? (
              <p className="py-10 text-center text-muted">Søk etter bilder. Unsplash fungerer best med engelske ord.</p>
            ) : photos.length === 0 ? (
              <p className="py-10 text-center text-muted">Ingen treff.</p>
            ) : (
              <div className="columns-2 gap-3 sm:columns-3">
                {photos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPhoto(p)}
                    disabled={!!importing}
                    className="group relative mb-3 block w-full overflow-hidden rounded-lg border border-hair text-left hover:border-brand disabled:opacity-60"
                    style={{ background: p.color }}
                    title={p.alt}
                  >
                    <img src={p.thumb} alt={p.alt} loading="lazy" className="block w-full" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-4 text-[11px] text-white">
                      {importing === p.id ? 'Henter …' : `Foto: ${p.author}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-center text-[11px] text-muted">
              Bilder fra{' '}
              <a href="https://unsplash.com/?utm_source=flatr&utm_medium=referral" target="_blank" rel="noreferrer" className="underline">
                Unsplash
              </a>
              . Bildet lagres i biblioteket (mappen Unsplash) med fotografens navn.
            </p>
          </>
        ) : (
        <>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="flex min-w-[180px] flex-1 items-center gap-2">
            <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
            <span className="sr-only">Søk</span>
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søk …" />
          </label>
          {[null, ...folders].map((f) => (
            <button
              key={f ?? '__all'}
              type="button"
              onClick={() => setFolder(f)}
              className={`h-8 rounded-full px-3 text-xs font-semibold ${
                folder === f ? 'bg-ink text-paper' : 'border border-line bg-card text-muted hover:text-ink'
              }`}
            >
              {f ?? 'Alle'}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="py-10 text-center text-muted">
            {items.length === 0 ? 'Ingen filer ennå. Last opp for å komme i gang.' : 'Ingen treff.'}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {shown.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onPick(api.media.url(m.id), m);
                  onClose();
                }}
                className="group overflow-hidden rounded-lg border border-hair bg-paper text-left hover:border-brand"
                title={m.name}
              >
                <div className="aspect-square bg-zone">
                  {isVideo(m) ? (
                    <video src={`${api.media.url(m.id)}#t=0.5`} preload="metadata" muted className="h-full w-full object-cover" />
                  ) : (
                    <img src={api.media.url(m.id)} alt={m.name} loading="lazy" className="h-full w-full object-contain p-1" />
                  )}
                </div>
                <div className="truncate px-2 py-1 text-xs text-muted">{m.name}</div>
              </button>
            ))}
          </div>
        )}
        </>
        )}
      </div>
    </Modal>
  );
}

export function MediaField({ label = 'Bilde', value, onChange, placeholder = 'https://… eller velg fra bibliotek', kind = 'image' }) {
  const [open, setOpen] = useState(false);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">
        {label}
      </span>
      <div className="flex gap-2">
        <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Icon name="image" className="h-3.5 w-3.5" />
          Bibliotek
        </Button>
      </div>
      {value && kind === 'image' && (
        <div className="mt-2 h-16 w-28 overflow-hidden rounded-lg border border-hair bg-zone">
          <img src={value} alt="" className="h-full w-full object-contain" />
        </div>
      )}
      {open && <MediaPicker kind={kind} onPick={(url) => onChange(url)} onClose={() => setOpen(false)} />}
    </label>
  );
}
