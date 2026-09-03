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

export function MediaPicker({ onPick, onClose }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

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
      for (const f of files) await api.media.upload(f);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <header className="flex items-center justify-between border-b border-hair px-5 py-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-ink">Mediebibliotek</h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
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
        {items.length === 0 ? (
          <p className="py-10 text-center text-muted">Ingen filer ennå. Last opp for å komme i gang.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {items.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onPick(api.media.url(m.id), m);
                  onClose();
                }}
                className="group overflow-hidden rounded-lg border border-hair bg-paper text-left hover:border-brand"
                title={m.name}
              >
                <div className="aspect-square bg-white">
                  <img src={api.media.url(m.id)} alt={m.name} className="h-full w-full object-contain p-1" />
                </div>
                <div className="truncate px-2 py-1 text-xs text-muted">{m.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function MediaField({ label = 'Bilde', value, onChange, placeholder = 'https://… eller velg fra bibliotek' }) {
  const [open, setOpen] = useState(false);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      <div className="flex gap-2">
        <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Icon name="image" className="h-3.5 w-3.5" />
          Bibliotek
        </Button>
      </div>
      {value && (
        <div className="mt-2 h-16 w-28 overflow-hidden rounded border border-hair bg-white">
          <img src={value} alt="" className="h-full w-full object-contain" />
        </div>
      )}
      {open && <MediaPicker onPick={(url) => onChange(url)} onClose={() => setOpen(false)} />}
    </label>
  );
}
