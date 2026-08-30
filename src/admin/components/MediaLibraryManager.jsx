import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Input, Button, Card, PageHeader, ErrorText } from './ui.jsx';

export default function MediaLibraryManager() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
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
    const list = [...(files || [])].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setBusy(true);
    setError('');
    try {
      for (const f of list) await api.media.upload(f);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Slette fila? Slides/sponsorer som bruker den mister bildet.')) return;
    try {
      await api.media.remove(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const copyUrl = (id) => {
    const abs = window.location.origin + api.media.url(id);
    navigator.clipboard?.writeText(abs).then(
      () => {},
      () => {}
    );
  };

  const shown = items.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <PageHeader
        crumbs={['Innhold', 'Bibliotek']}
        action={
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="plus" className="h-4 w-4" />
            {busy ? 'Laster opp …' : 'Last opp'}
          </Button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => upload(e.target.files)}
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-6 sm:p-8">
        <ErrorText>{error}</ErrorText>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            upload(e.dataTransfer.files);
          }}
          className={`rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors ${
            drag ? 'border-brand bg-brand-tint text-brand' : 'border-line text-muted'
          }`}
        >
          Dra og slipp bilder her, eller bruk «Last opp».
        </div>

        <div className="flex items-center gap-2">
          <Icon name="search" className="h-4 w-4 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søk …" />
        </div>

        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-muted">
            {items.length === 0 ? 'Ingen filer lastet opp ennå.' : 'Ingen treff.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {shown.map((m) => (
              <Card key={m.id}>
                <div className="aspect-square overflow-hidden rounded-lg bg-white">
                  <img
                    src={api.media.url(m.id)}
                    alt={m.name}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="mt-2 truncate text-sm font-semibold text-ink" title={m.name}>
                  {m.name}
                </div>
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => copyUrl(m.id)}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    Kopier URL
                  </button>
                  <button
                    onClick={() => remove(m.id)}
                    className="ml-auto text-xs font-semibold text-danger hover:underline"
                  >
                    Slett
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
