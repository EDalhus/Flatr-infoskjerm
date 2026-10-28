// Presentasjoner – gjenbrukbare rekker av lysbilder. Kanaler velger hvilken
// presentasjon de viser. ?edit=<id> åpner en presentasjon i editoren.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Field, Input, Select, Button, IconButton, PageHeader, ErrorText } from './ui.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import Editor from './editor/Editor.jsx';
import { useUrlParam } from '../useUrlParam.js';

const fmtDuration = (sec) => {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  return m ? `${m} min ${s % 60 ? `${s % 60} s` : ''}`.trim() : `${s} s`;
};


function NewPlaylist({ onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [orientation, setOrientation] = useState('landscape');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onCreated(await api.playlists.create({ name, orientation }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-2xl border border-line bg-card p-5 shadow-card sm:grid-cols-[1fr_200px_auto] sm:items-end"
    >
      <Field label="Navn">
        <Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Velkommen – morgen" />
      </Field>
      <Field label="Format">
        <Select value={orientation} onChange={(e) => setOrientation(e.target.value)}>
          <option value="landscape">Liggende 16:9</option>
          <option value="portrait">Stående 9:16</option>
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Oppretter …' : 'Opprett og rediger'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Avbryt
        </Button>
      </div>
      {error && (
        <div className="sm:col-span-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </form>
  );
}

function PlaylistCard({ p, onEdit, onDuplicate, onDelete }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-hair bg-card p-2.5 shadow-card">
      <button type="button" onClick={() => onEdit(p.id)} className="block text-left" aria-label={`Rediger ${p.name}`}>
        <LiveScreenView playlistId={p.id} orientation={p.orientation} />
      </button>
      <div className="flex flex-col gap-2 px-1.5 pb-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="m-0 truncate text-base font-bold text-ink">{p.name}</h3>
            <p className="m-0 text-sm text-muted">
              {p.slide_count} lysbilde{p.slide_count === 1 ? '' : 'r'} · {fmtDuration(p.total_seconds)} ·{' '}
              {p.orientation === 'portrait' ? 'Stående' : 'Liggende'}
            </p>
          </div>
          <IconButton name="copy" label="Dupliser" onClick={() => onDuplicate(p)} />
          <IconButton name="trash" label="Slett" tone="danger" onClick={() => onDelete(p)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {p.used_by.length ? (
            p.used_by.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-zone px-2.5 py-0.5 text-xs font-medium text-ink/80">
                <Icon name="monitor" className="h-3 w-3" />
                {u.name}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted">Ikke i bruk på noen skjerm</span>
          )}
        </div>
        <Button variant="outline" onClick={() => onEdit(p.id)} className="mt-1">
          <Icon name="edit" className="h-4 w-4" />
          Rediger innhold
        </Button>
      </div>
    </article>
  );
}

function PlaylistList({ onEdit, onChange }) {
  const [items, setItems] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    api.playlists
      .list()
      .then((rows) => setItems(rows || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const duplicate = async (p) => {
    try {
      await api.playlists.duplicate(p.id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (p) => {
    const warn = p.used_by.length
      ? `«${p.name}» vises på ${p.used_by.map((u) => u.name).join(', ')}. Skjermene blir tomme til du velger en annen presentasjon.\n\nSlette likevel? Den havner i papirkurven.`
      : `Slette «${p.name}»? Den havner i papirkurven.`;
    if (!confirm(warn)) return;
    try {
      await api.playlists.remove(p.id);
      await load();
      onChange?.();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Presentasjoner"
        subtitle="Det skjermene viser: lysbilder med tekst, bilder, program og mer. Velg på hver skjerm hvilken presentasjon den viser."
        action={
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <Icon name="plus" className="h-4 w-4" />
              Ny presentasjon
            </Button>
          )
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 pb-12 pt-4 sm:px-8">
        {creating && <NewPlaylist onCreated={(p) => onEdit(p.id)} onCancel={() => setCreating(false)} />}
        <ErrorText>{error}</ErrorText>

        {items && items.length === 0 && !creating && (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-card px-6 py-14 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-tint text-brand">
              <Icon name="layers" className="h-7 w-7" />
            </div>
            <h2 className="m-0 text-xl font-bold text-ink">Ingen presentasjoner ennå</h2>
            <p className="m-0 max-w-md text-sm text-muted">
              En presentasjon er innholdet en skjerm viser – lysbilder med tekst, bilder, program og mer.
            </p>
            <Button onClick={() => setCreating(true)}>Lag din første presentasjon</Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(items || []).map((p) => (
            <PlaylistCard key={p.id} p={p} onEdit={onEdit} onDuplicate={duplicate} onDelete={remove} />
          ))}
        </div>
      </div>
    </>
  );
}

export default function PlaylistsManager({ onChange, me }) {
  // Åpen presentasjon bor i adressen (?edit=), så Tilbake lukker editoren.
  const [edit, setEdit] = useUrlParam('edit');
  const editingId = /^\d+$/.test(edit) ? Number(edit) : null;

  return editingId ? (
    <Editor playlistId={editingId} onBack={() => setEdit(null)} onChange={onChange} me={me} />
  ) : (
    <PlaylistList onEdit={setEdit} onChange={onChange} />
  );
}
