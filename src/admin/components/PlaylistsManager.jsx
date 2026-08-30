import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { SLIDE_TYPES, SLIDE_TYPE_LABEL, SLIDE_TYPE_ICON, defaultConfig } from '../../lib/slides.js';
import {
  Icon,
  Field,
  Input,
  Button,
  IconButton,
  Card,
  GroupCard,
  Row,
  MediaTile,
  PageHeader,
  ErrorText
} from './ui.jsx';
import SlideForm from './slides/SlideForm.jsx';

const fmt = (sec) => {
  const s = Number(sec) || 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

/* ---------------- editor ---------------- */

function PlaylistEditor({ playlistId, onBack, onChange }) {
  const [playlist, setPlaylist] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [slideTemplates, setSlideTemplates] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState('message');
  const [error, setError] = useState('');

  const reloadItems = () => api.playlistItems.list(playlistId).then((r) => setItems(r || []));
  const reloadTpls = () => api.templates.list('slide').then((r) => setSlideTemplates(r || []));

  useEffect(() => {
    Promise.all([
      api.playlists.get(playlistId),
      api.categories.list(),
      api.templates.list('slide')
    ])
      .then(([pl, cats, tpls]) => {
        setPlaylist(pl);
        setItems(pl.items || []);
        setCategories(cats || []);
        setSlideTemplates(tpls || []);
      })
      .catch((e) => setError(e.message));
  }, [playlistId]);

  const after = async () => {
    await reloadItems();
    onChange?.();
  };

  const add = async () => {
    try {
      if (adding.startsWith('tpl:')) {
        const tpl = await api.templates.get(Number(adding.slice(4)));
        const p = tpl.payload || {};
        await api.playlistItems.create({
          playlist_id: Number(playlistId),
          type: p.type || 'message',
          title: p.title || tpl.name,
          duration_seconds: p.duration_seconds,
          config: p.config || {}
        });
      } else {
        const created = await api.playlistItems.create({
          playlist_id: Number(playlistId),
          type: adding,
          title: SLIDE_TYPE_LABEL[adding],
          config: defaultConfig(adding)
        });
        if (created?.id) setOpenId(created.id);
      }
      await after();
    } catch (e) {
      setError(e.message);
    }
  };

  const update = async (id, patch) => {
    try {
      await api.playlistItems.update(id, patch);
      await after();
    } catch (e) {
      setError(e.message);
    }
  };
  const remove = async (id) => {
    try {
      await api.playlistItems.remove(id);
      await after();
    } catch (e) {
      setError(e.message);
    }
  };
  const reorder = async (list, index, dir) => {
    const a = list[index];
    const b = list[index + dir];
    if (!a || !b) return;
    try {
      await Promise.all([
        api.playlistItems.update(a.id, { position: b.position }),
        api.playlistItems.update(b.id, { position: a.position })
      ]);
      await after();
    } catch (e) {
      setError(e.message);
    }
  };

  const saveTemplate = async (payload) => {
    const name = window.prompt('Navn på slide-mal:');
    if (!name) return;
    try {
      await api.templates.create({ name: name.trim(), kind: 'slide', payload });
      reloadTpls();
      alert('Lagret som mal.');
    } catch (e) {
      alert(e.message);
    }
  };

  if (!playlist) {
    return (
      <>
        <PageHeader crumbs={['Innhold', 'Spillelister', '…']} />
        <div className="p-8 text-muted">Laster …</div>
      </>
    );
  }

  const list = [...items].sort((a, b) => a.position - b.position || a.id - b.id);

  return (
    <>
      <PageHeader
        crumbs={['Innhold', 'Spillelister', playlist.name]}
        action={
          <Button variant="outline" onClick={onBack}>
            <Icon name="back" className="h-4 w-4" />
            Tilbake
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-4xl space-y-6 p-6 sm:p-8">
        <Card title="Spilleliste">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Navn">
              <Input
                value={playlist.name}
                onChange={(e) => setPlaylist({ ...playlist, name: e.target.value })}
                onBlur={() => api.playlists.update(playlist.id, { name: playlist.name }).then(onChange)}
              />
            </Field>
            <Field label="Mappe (valgfri)">
              <Input
                value={playlist.folder || ''}
                onChange={(e) => setPlaylist({ ...playlist, folder: e.target.value })}
                onBlur={() =>
                  api.playlists.update(playlist.id, { folder: playlist.folder || null }).then(onChange)
                }
              />
            </Field>
          </div>
        </Card>

        <GroupCard
          label={`Slides · ${list.length}`}
          icon="layers"
          right={
            <div className="flex items-center gap-1.5">
              <select
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                className="max-w-[9rem] rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink"
              >
                <optgroup label="Slide">
                  {SLIDE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
                {slideTemplates.length > 0 && (
                  <optgroup label="Fra mal">
                    {slideTemplates.map((t) => (
                      <option key={t.id} value={`tpl:${t.id}`}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                onClick={add}
                className="inline-flex items-center gap-1 rounded-lg bg-brand px-2 py-1 text-xs font-bold uppercase tracking-wide text-white hover:bg-brand-dark"
              >
                <Icon name="plus" className="h-3.5 w-3.5" />
                Legg til
              </button>
            </div>
          }
        >
          {list.length === 0 && (
            <div className="px-5 py-4 text-sm text-muted">Ingen slides ennå.</div>
          )}
          {list.map((s, i) => (
            <div key={s.id}>
              <Row
                media={
                  <MediaTile tone={s.enabled === 0 ? 'muted' : 'brand'}>
                    <Icon name={SLIDE_TYPE_ICON[s.type] || 'layers'} className="h-5 w-5" />
                  </MediaTile>
                }
                title={
                  <span className={s.enabled === 0 ? 'text-muted line-through' : ''}>
                    {s.title || SLIDE_TYPE_LABEL[s.type] || s.type}
                  </span>
                }
                meta={
                  <>
                    <span>{SLIDE_TYPE_LABEL[s.type] || s.type}</span>
                    <span>· {s.duration_seconds}s</span>
                    {s.enabled === 0 && <span>· av</span>}
                  </>
                }
                actions={
                  <>
                    <IconButton
                      name="up"
                      label="Flytt opp"
                      onClick={() => reorder(list, i, -1)}
                      className={i === 0 ? 'pointer-events-none opacity-30' : ''}
                    />
                    <IconButton
                      name="down"
                      label="Flytt ned"
                      onClick={() => reorder(list, i, 1)}
                      className={i === list.length - 1 ? 'pointer-events-none opacity-30' : ''}
                    />
                    <IconButton name="x" label="Slett" tone="danger" onClick={() => remove(s.id)} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenId(openId === s.id ? null : s.id)}
                    >
                      {openId === s.id ? 'Lukk' : 'Endre'}
                    </Button>
                  </>
                }
              />
              {openId === s.id && (
                <SlideForm
                  slide={s}
                  categories={categories}
                  onCancel={() => setOpenId(null)}
                  onSaveTemplate={saveTemplate}
                  onSave={async (patch) => {
                    await update(s.id, patch);
                    setOpenId(null);
                  }}
                />
              )}
            </div>
          ))}
        </GroupCard>
        <ErrorText>{error}</ErrorText>
      </div>
    </>
  );
}

/* ---------------- liste ---------------- */

function PlaylistList({ onEdit, onChange }) {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.playlists
      .list()
      .then((r) => setItems(r || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await api.playlists.create({ name: name.trim() });
      setName('');
      await load();
      onChange?.();
      if (created?.id) onEdit(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Slette spillelista? Skjermer som bruker den mister den sonen.')) return;
    try {
      await api.playlists.remove(id);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader crumbs={['Innhold', 'Spillelister']} />
      <div className="mx-auto w-full max-w-4xl space-y-6 p-6 sm:p-8">
        <Card title="Ny spilleliste">
          <form onSubmit={create} className="flex gap-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sponsorer VLAN" />
            <Button type="submit" disabled={busy}>
              {busy ? 'Oppretter …' : 'Opprett'}
            </Button>
          </form>
          <div className="mt-3">
            <ErrorText>{error}</ErrorText>
          </div>
        </Card>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-muted">
            Ingen spillelister ennå.
          </p>
        ) : (
          <GroupCard label={`Spillelister · ${items.length}`} icon="layers">
            {items.map((p) => (
              <Row
                key={p.id}
                media={
                  <MediaTile tone="ok">
                    <Icon name="layers" className="h-5 w-5" />
                  </MediaTile>
                }
                title={p.name}
                meta={
                  <>
                    <span>{p.item_count ?? 0} slides</span>
                    <span>· {fmt(p.total_seconds)}</span>
                    {p.folder && <span>· {p.folder}</span>}
                  </>
                }
                actions={
                  <>
                    <IconButton name="x" label="Slett" tone="danger" onClick={() => remove(p.id)} />
                    <Button size="sm" variant="outline" onClick={() => onEdit(p.id)}>
                      Rediger
                    </Button>
                  </>
                }
              />
            ))}
          </GroupCard>
        )}
      </div>
    </>
  );
}

/* ---------------- toppnivå ---------------- */

const initialEdit = () => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('edit');
  return v && /^\d+$/.test(v) ? Number(v) : null;
};

export default function PlaylistsManager({ onChange }) {
  const [editingId, setEditingId] = useState(initialEdit);

  const setEdit = (id) => {
    setEditingId(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set('edit', id);
      else url.searchParams.delete('edit');
      window.history.replaceState(null, '', url);
    }
  };

  return editingId ? (
    <PlaylistEditor playlistId={editingId} onBack={() => setEdit(null)} onChange={onChange} />
  ) : (
    <PlaylistList onEdit={setEdit} onChange={onChange} />
  );
}
