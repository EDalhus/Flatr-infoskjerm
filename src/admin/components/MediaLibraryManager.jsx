// Mediebibliotek – bilder og video, organisert i mapper. Dra filer hvor som
// helst på siden for å laste opp til mappen du står i.

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Input, Select, Button, IconButton, PageHeader, ErrorText } from './ui.jsx';

const ACCEPT = 'image/*,video/*';
const ALL = '__all';
const NONE = '__none';

const isVideo = (m) => (m.content_type || '').startsWith('video/');
const isAccepted = (f) => f.type.startsWith('image/') || f.type.startsWith('video/');

function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} kB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${(b / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
}

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function Thumb({ m, className = '' }) {
  const src = api.media.url(m.id);
  return isVideo(m) ? (
    <video src={`${src}#t=0.5`} preload="metadata" muted playsInline className={`h-full w-full object-cover ${className}`} />
  ) : (
    <img src={src} alt="" loading="lazy" className={`h-full w-full object-cover ${className}`} />
  );
}

function Tile({ m, selected, selecting, onOpen, onToggle }) {
  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition-shadow hover:shadow-pop ${
        selected ? 'border-brand ring-2 ring-brand/40' : 'border-hair'
      }`}
    >
      <button
        type="button"
        onClick={() => (selecting ? onToggle(m.id) : onOpen(m.id))}
        className="relative block aspect-[4/3] overflow-hidden bg-zone"
        aria-label={`Åpne ${m.name}`}
      >
        <Thumb m={m} />
        {isVideo(m) && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Icon name="play" className="h-3 w-3" />
            Video
          </span>
        )}
      </button>
      <label
        className={`absolute left-2 top-2 grid h-7 w-7 cursor-pointer place-items-center rounded-lg border bg-card/90 shadow-card transition-opacity ${
          selected || selecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
        } ${selected ? 'border-brand' : 'border-line'}`}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(m.id)}
          className="h-4 w-4 accent-[rgb(var(--c-brand))]"
          aria-label={`Velg ${m.name}`}
        />
      </label>
      <div className="flex flex-col px-3 py-2.5">
        <span className="truncate text-sm font-semibold text-ink" title={m.name}>
          {m.name}
        </span>
        <span className="text-xs text-muted">{fmtBytes(m.size)}</span>
      </div>
    </div>
  );
}

function UploadQueue({ queue }) {
  if (!queue.length) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-card p-4 shadow-card">
      {queue.map((u) => (
        <div key={u.key} className="flex items-center gap-3 text-sm">
          <span className="min-w-0 flex-1 truncate text-ink">{u.name}</span>
          {u.error ? (
            <span className="shrink-0 text-xs font-semibold text-danger">{u.error}</span>
          ) : (
            <span className="h-1.5 w-40 shrink-0 overflow-hidden rounded-full bg-hair">
              <span
                className="block h-full rounded-full bg-brand transition-[width]"
                style={{ width: `${Math.round((u.done ? 1 : u.progress) * 100)}%` }}
              />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Drawer({ id, folders, onClose, onChanged, onDeleted, onNavigate }) {
  const [m, setM] = useState(null);
  const [name, setName] = useState('');
  const [dims, setDims] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setM(null);
    setDims(null);
    api.media
      .get(id)
      .then((row) => {
        setM(row);
        setName(row.name);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (patch) => {
    try {
      const row = await api.media.update(id, patch);
      setM((cur) => ({ ...cur, ...row }));
      onChanged(row);
    } catch (e) {
      setError(e.message);
    }
  };

  const usageCount = (m?.usage?.slides?.length || 0) + (m?.usage?.sponsors?.length || 0);
  const link = `${window.location.origin}${api.media.url(id)}`;

  const remove = async () => {
    const msg = usageCount
      ? `«${m.name}» brukes ${usageCount} sted${usageCount === 1 ? '' : 'er'}. Der forsvinner den hvis du sletter.\n\nSlette likevel? Den havner i papirkurven.`
      : `Slette «${m.name}»? Den havner i papirkurven.`;
    if (!confirm(msg)) return;
    try {
      await api.media.remove(id);
      onDeleted(id);
    } catch (e) {
      setError(e.message);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Kopier lenken:', link);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Detaljer for fil"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-card shadow-pop"
        style={{ animation: 'drawerIn 0.2s ease-out' }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="text-sm font-semibold text-muted">Detaljer</span>
          <IconButton name="x" label="Lukk" onClick={onClose} />
        </div>
        {!m ? (
          <div className="p-5 text-sm text-muted">{error || 'Laster …'}</div>
        ) : (
          <div className="flex flex-col gap-5 p-5">
            <div className="overflow-hidden rounded-2xl bg-zone">
              {isVideo(m) ? (
                <video
                  src={api.media.url(m.id)}
                  controls
                  className="max-h-72 w-full bg-black"
                  onLoadedMetadata={(e) => setDims([e.currentTarget.videoWidth, e.currentTarget.videoHeight])}
                />
              ) : (
                <img
                  src={api.media.url(m.id)}
                  alt={m.name}
                  className="max-h-72 w-full object-contain"
                  onLoad={(e) => setDims([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
                />
              )}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted">Navn</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name !== m.name && save({ name })}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted">Mappe</span>
              <FolderSelect value={m.folder || ''} folders={folders} onChange={(folder) => save({ folder })} />
            </label>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Type</dt>
              <dd className="m-0 text-ink">{m.content_type || '–'}</dd>
              <dt className="text-muted">Størrelse</dt>
              <dd className="m-0 text-ink">{fmtBytes(m.size)}</dd>
              <dt className="text-muted">Dimensjoner</dt>
              <dd className="m-0 text-ink">{dims ? `${dims[0]} × ${dims[1]}` : '–'}</dd>
              <dt className="text-muted">Lastet opp</dt>
              <dd className="m-0 text-ink">{fmtDate(m.created_at)}</dd>
            </dl>

            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-sm font-bold text-ink">Brukes i</h3>
              {usageCount === 0 ? (
                <p className="m-0 text-sm text-muted">Ikke i bruk ennå.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {m.usage.slides.map((u) => (
                    <li key={`s${u.slide_id}`}>
                      <button
                        type="button"
                        onClick={() => onNavigate?.('playlists', { edit: u.playlist_id })}
                        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-zone"
                      >
                        <Icon name="layers" className="h-4 w-4 shrink-0 text-muted" />
                        <span className="truncate text-ink">
                          {u.playlist_name}
                          <span className="text-muted"> · {u.slide_name || 'Lysbilde'}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {m.usage.sponsors.map((u) => (
                    <li key={`p${u.id}`} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                      <Icon name="image" className="h-4 w-4 shrink-0 text-muted" />
                      <span className="truncate text-ink">
                        Sponsor <span className="text-muted">· {u.name}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <ErrorText>{error}</ErrorText>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="outline" onClick={copy}>
                <Icon name={copied ? 'check' : 'link'} className="h-4 w-4" />
                {copied ? 'Kopiert' : 'Kopier lenke'}
              </Button>
              <a
                href={api.media.url(m.id)}
                download={m.name}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-semibold text-ink hover:bg-hair"
              >
                <Icon name="down" className="h-4 w-4" />
                Last ned
              </a>
              <Button variant="danger" onClick={remove} className="ml-auto">
                <Icon name="trash" className="h-4 w-4" />
                Slett
              </Button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

/** Mappevelger med «+ Ny mappe …». `value` "" = ingen mappe. */
function FolderSelect({ value, folders, onChange, placeholder = 'Ingen mappe', className = '' }) {
  return (
    <Select
      value={value}
      className={className}
      onChange={(e) => {
        if (e.target.value === '__new') {
          const name = window.prompt('Navn på ny mappe:');
          if (name?.trim()) onChange(name.trim());
          return;
        }
        onChange(e.target.value || null);
      }}
    >
      <option value="">{placeholder}</option>
      {folders.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
      <option value="__new">+ Ny mappe …</option>
    </Select>
  );
}

export default function MediaLibraryManager({ onNavigate }) {
  const [items, setItems] = useState(null);
  const [extraFolders, setExtraFolders] = useState([]);
  const [folder, setFolder] = useState(ALL);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('new');
  const [selected, setSelected] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [queue, setQueue] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [quota, setQuota] = useState(null); // bytes, fra kontoens kvote
  const fileRef = useRef(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    api.settings
      .get()
      .then((s) => setQuota(s.limits?.storageBytes ?? null))
      .catch(() => {});
  }, []);

  const load = () =>
    api.media
      .list()
      .then((rows) => setItems(rows || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const folders = useMemo(() => {
    const set = new Set(extraFolders);
    for (const m of items || []) if (m.folder) set.add(m.folder);
    return [...set].sort((a, b) => a.localeCompare(b, 'nb'));
  }, [items, extraFolders]);

  const counts = useMemo(() => {
    const c = { [ALL]: 0, [NONE]: 0 };
    for (const m of items || []) {
      c[ALL]++;
      c[m.folder || NONE] = (c[m.folder || NONE] || 0) + 1;
    }
    return c;
  }, [items]);

  const totalBytes = useMemo(() => (items || []).reduce((s, m) => s + (Number(m.size) || 0), 0), [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (items || []).filter(
      (m) =>
        (folder === ALL || (folder === NONE ? !m.folder : m.folder === folder)) &&
        (type === 'all' || (type === 'video' ? isVideo(m) : !isVideo(m))) &&
        (!q || m.name.toLowerCase().includes(q))
    );
    const by = {
      new: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
      name: (a, b) => a.name.localeCompare(b.name, 'nb'),
      size: (a, b) => (Number(b.size) || 0) - (Number(a.size) || 0)
    }[sort];
    return list.sort(by);
  }, [items, folder, type, query, sort]);

  const currentFolder = folder === ALL || folder === NONE ? null : folder;

  const upload = async (fileList) => {
    const files = [...(fileList || [])];
    const rejected = files.filter((f) => !isAccepted(f));
    const ok = files.filter(isAccepted);
    if (rejected.length) setError(`Hoppet over ${rejected.length} fil(er): bare bilder og video støttes foreløpig.`);
    if (!ok.length) return;

    const entries = ok.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, progress: 0, file: f }));
    setQueue((q) => [...q, ...entries]);
    for (const entry of entries) {
      try {
        await api.media.uploadWithProgress(entry.file, currentFolder, (p) =>
          setQueue((q) => q.map((u) => (u.key === entry.key ? { ...u, progress: p } : u)))
        );
        setQueue((q) => q.map((u) => (u.key === entry.key ? { ...u, done: true } : u)));
      } catch (e) {
        setQueue((q) => q.map((u) => (u.key === entry.key ? { ...u, error: e.message } : u)));
      }
    }
    await load();
    setTimeout(() => setQueue((q) => q.filter((u) => u.error)), 1200);
  };

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const moveSelected = async (to) => {
    try {
      await Promise.all([...selected].map((id) => api.media.update(id, { folder: to })));
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteSelected = async () => {
    if (!confirm(`Slette ${selected.size} fil(er)? De havner i papirkurven. Lysbilder som bruker dem mister bildet.`)) return;
    try {
      await Promise.all([...selected].map((id) => api.media.remove(id)));
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const newFolder = () => {
    const name = window.prompt('Navn på ny mappe:');
    if (!name?.trim()) return;
    setExtraFolders((f) => [...new Set([...f, name.trim()])]);
    setFolder(name.trim());
  };

  const dragHandlers = {
    onDragEnter: (e) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      dragDepth.current++;
      setDragging(true);
    },
    onDragOver: (e) => e.preventDefault(),
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDrop: (e) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      upload(e.dataTransfer.files);
    }
  };

  const folderBtn = (id, label, count) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setFolder(id);
        setSelected(new Set());
      }}
      aria-current={folder === id ? 'true' : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
        folder === id ? 'bg-brand-tint text-brand-dark' : 'text-ink/80 hover:bg-zone'
      }`}
    >
      <Icon name={id === ALL ? 'image' : 'layers'} className="h-4 w-4 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs text-muted">{count || 0}</span>
    </button>
  );

  return (
    <div className="relative flex min-h-full flex-col" {...dragHandlers}>
      <PageHeader
        title="Mediebibliotek"
        subtitle={
          items ? `${items.length} filer · ${fmtBytes(totalBytes)}${quota ? ` av ${fmtBytes(quota)}` : ''} brukt` : ' '
        }
        action={
          <>
            <Button variant="outline" onClick={newFolder}>
              <Icon name="plus" className="h-4 w-4" />
              Ny mappe
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <Icon name="plus" className="h-4 w-4" />
              Last opp
            </Button>
          </>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-6 px-6 pb-12 pt-4 sm:px-8">
        <nav
          aria-label="Mapper"
          className="flex w-full flex-row gap-1 overflow-x-auto md:w-56 md:flex-col md:overflow-visible"
        >
          {folderBtn(ALL, 'Alle filer', counts[ALL])}
          {folderBtn(NONE, 'Uten mappe', counts[NONE])}
          {folders.map((f) => folderBtn(f, f, counts[f]))}
        </nav>

        <div className="flex min-w-0 flex-1 basis-[560px] flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-[200px] flex-1 items-center gap-2">
              <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
              <span className="sr-only">Søk</span>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søk etter filnavn …" />
            </label>
            <label>
              <span className="sr-only">Type</span>
              <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-32">
                <option value="all">Alle typer</option>
                <option value="image">Bilder</option>
                <option value="video">Video</option>
              </Select>
            </label>
            <label>
              <span className="sr-only">Sortering</span>
              <Select value={sort} onChange={(e) => setSort(e.target.value)} className="!w-36">
                <option value="new">Nyeste først</option>
                <option value="name">Navn A–Å</option>
                <option value="size">Størst først</option>
              </Select>
            </label>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-sm text-paper">
              <span className="font-semibold">{selected.size} valgt</span>
              <span className="ml-auto" />
              <FolderSelect
                value=""
                folders={folders}
                placeholder="Flytt til mappe …"
                onChange={(to) => moveSelected(to)}
                className="!w-48 !text-ink"
              />
              <Button variant="danger" onClick={deleteSelected}>
                Slett
              </Button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-lg px-2 py-1 font-semibold opacity-80 hover:opacity-100"
              >
                Avbryt
              </button>
            </div>
          )}

          <UploadQueue queue={queue} />
          <ErrorText>{error}</ErrorText>

          {items && shown.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line bg-card px-6 py-14 text-center hover:border-brand"
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-tint text-brand">
                <Icon name="image" className="h-7 w-7" />
              </span>
              <span className="text-lg font-bold text-ink">
                {items.length === 0 ? 'Last opp dine første bilder og videoer' : 'Ingen filer her'}
              </span>
              <span className="max-w-sm text-sm text-muted">
                Dra og slipp filer hvor som helst på siden, eller klikk her.
                {currentFolder ? ` De havner i mappen «${currentFolder}».` : ''}
              </span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((m) => (
                <Tile
                  key={m.id}
                  m={m}
                  selected={selected.has(m.id)}
                  selecting={selected.size > 0}
                  onOpen={setOpenId}
                  onToggle={toggle}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-brand/15 p-6">
          <div className="rounded-3xl border-2 border-dashed border-brand bg-card px-10 py-8 text-center shadow-pop">
            <div className="text-lg font-bold text-ink">Slipp for å laste opp</div>
            <div className="text-sm text-muted">{currentFolder ? `Til mappen «${currentFolder}»` : 'Til biblioteket'}</div>
          </div>
        </div>
      )}

      {openId && (
        <Drawer
          id={openId}
          folders={folders}
          onClose={() => setOpenId(null)}
          onNavigate={onNavigate}
          onChanged={(row) => setItems((list) => list.map((m) => (m.id === row.id ? { ...m, ...row } : m)))}
          onDeleted={(id) => {
            setOpenId(null);
            setItems((list) => list.filter((m) => m.id !== id));
          }}
        />
      )}
    </div>
  );
}
