// Kanaler – det en gruppe skjermer viser. Hver kanal viser én spilleliste
// (innholdet redigeres under Spillelister) og har sin egen rotasjon for
// fysisk montering.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Field, Input, Select, Button, IconButton, PageHeader, ErrorText } from './ui.jsx';
import LiveScreenView from './LiveScreenView.jsx';

// Fjernstyrt rotasjon for fysisk montering (grader). Styres herfra, ikke fra TV-en.
const ROTATION_OPTIONS = [0, 90, 135, 180, 270];
const NEW_PLAYLIST = 'new';

function NewChannel({ playlists, onCreated, onCancel }) {
  const [form, setForm] = useState({ name: '', location: '', playlist: NEW_PLAYLIST, orientation: 'landscape', rotation: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api.screens.create({
        name: form.name,
        location: form.location || null,
        rotation: form.rotation,
        ...(form.playlist === NEW_PLAYLIST
          ? { orientation: form.orientation }
          : { playlist_id: Number(form.playlist) })
      });
      onCreated(created);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-line bg-card p-5 shadow-card sm:grid-cols-2">
      <Field label="Navn">
        <Input autoFocus required value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Resepsjon" />
      </Field>
      <Field label="Plassering">
        <Input value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="1. etasje" />
      </Field>
      <Field label="Viser spilleliste">
        <Select value={form.playlist} onChange={(e) => set({ playlist: e.target.value })}>
          <option value={NEW_PLAYLIST}>+ Ny spilleliste med samme navn</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      {form.playlist === NEW_PLAYLIST ? (
        <Field label="Format">
          <Select value={form.orientation} onChange={(e) => set({ orientation: e.target.value })}>
            <option value="landscape">Liggende 16:9</option>
            <option value="portrait">Stående 9:16</option>
          </Select>
        </Field>
      ) : (
        <Field label="Rotasjon" hint="Roterer visningen for fysisk montering.">
          <Select value={form.rotation} onChange={(e) => set({ rotation: Number(e.target.value) })}>
            {ROTATION_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}°
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Oppretter …' : 'Opprett skjerm'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Avbryt
        </Button>
      </div>
      {error && (
        <div className="sm:col-span-2">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </form>
  );
}

function ChannelCard({ s, playlists, onPatch, onEditContent, onDuplicate, onDelete }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/display/${s.id}`;

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
    <article className="flex flex-col gap-3 rounded-2xl border border-hair bg-card p-2.5 shadow-card">
      <LiveScreenView screenId={s.id} orientation={s.orientation} />
      <div className="flex flex-col gap-3 px-1.5 pb-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="m-0 flex items-center gap-2 truncate text-base font-bold text-ink">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${s.online ? 'bg-ok' : 'bg-muted/40'}`}
                title={s.online ? 'En TV viser skjermen nå' : 'Ingen TV viser skjermen nå'}
              />
              <span className="truncate">{s.name}</span>
            </h3>
            <p className="m-0 truncate text-sm text-muted">
              {s.location ? `${s.location} · ` : ''}
              {s.now_off
                ? 'Skjerm av nå (tidsplan)'
                : s.now_slot
                  ? `Nå: ${s.now_playlist_name} (tidsplan)`
                  : `${s.slide_count} lysbilde${s.slide_count === 1 ? '' : 'r'}`}
            </p>
          </div>
          <IconButton name="copy" label="Dupliser skjerm" onClick={() => onDuplicate(s)} />
          <IconButton name="trash" label="Slett skjerm" tone="danger" onClick={() => onDelete(s)} />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="min-w-0">
            <span className="sr-only">Standard-spilleliste for {s.name}</span>
            <Select
              value={s.playlist_id ?? ''}
              onChange={(e) => onPatch(s.id, { playlist_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Ingen spilleliste</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Rotasjon</span>
            <Select
              value={s.rotation ?? 0}
              onChange={(e) => onPatch(s.id, { rotation: Number(e.target.value) })}
              className="!w-20"
              title="Rotasjon for fysisk montering"
            >
              {ROTATION_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}°
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onEditContent(s)} disabled={!s.playlist_id} className="flex-1">
            <Icon name="edit" className="h-4 w-4" />
            Rediger innhold
          </Button>
          <Button variant="outline" onClick={copy} title={link}>
            <Icon name={copied ? 'check' : 'link'} className="h-4 w-4" />
            {copied ? 'Kopiert' : 'Lenke'}
          </Button>
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            aria-label={`Åpne ${s.name} i ny fane`}
            className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-card text-ink hover:bg-hair"
          >
            <Icon name="external" className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

export default function ScreensManager({ onChange, onNavigate }) {
  const [screens, setScreens] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    Promise.all([api.screens.list(), api.playlists.list()])
      .then(([s, p]) => {
        setScreens(s || []);
        setPlaylists(p || []);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, []);

  const editContent = (s) => onNavigate?.('playlists', { edit: s.playlist_id });

  // Eldre lenker (?view=screens&edit=<kanal>) åpner nå kanalens spilleliste.
  useEffect(() => {
    const legacy = new URLSearchParams(window.location.search).get('edit');
    if (!legacy || !screens) return;
    const s = screens.find((x) => String(x.id) === legacy);
    if (s?.playlist_id) editContent(s);
  }, [screens]);

  const patch = async (id, body) => {
    setScreens((prev) => prev.map((s) => (s.id === id ? { ...s, ...body } : s)));
    try {
      const updated = await api.screens.update(id, body);
      setScreens((prev) => prev.map((s) => (s.id === id ? updated : s)));
      onChange?.();
    } catch (err) {
      setError(err.message);
      load();
    }
  };

  const duplicate = async (s) => {
    try {
      await api.screens.duplicate(s.id);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (s) => {
    if (!confirm(`Slette skjermen «${s.name}»? Spillelisten beholdes. Skjermen havner i papirkurven.`)) return;
    try {
      await api.screens.remove(s.id);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Skjermer"
        subtitle="En skjerm er det du vil vise ett sted – på én eller flere TV-er. Velg spilleliste og rotasjon for hver skjerm."
        action={
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <Icon name="plus" className="h-4 w-4" />
              Ny skjerm
            </Button>
          )
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 pb-12 pt-4 sm:px-8">
        {creating && (
          <NewChannel
            playlists={playlists}
            onCancel={() => setCreating(false)}
            onCreated={async () => {
              setCreating(false);
              await load();
              onChange?.();
            }}
          />
        )}
        <ErrorText>{error}</ErrorText>

        {screens && screens.length === 0 && !creating && (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-card px-6 py-14 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-tint text-brand">
              <Icon name="monitor" className="h-7 w-7" />
            </div>
            <h2 className="m-0 text-xl font-bold text-ink">Ingen skjermer ennå</h2>
            <p className="m-0 max-w-md text-sm text-muted">
              Lag en skjerm for hvert sted som skal vise sitt eget innhold, for eksempel «Resepsjon» eller «Kantina».
            </p>
            <Button onClick={() => setCreating(true)}>Lag din første skjerm</Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(screens || []).map((s) => (
            <ChannelCard
              key={s.id}
              s={s}
              playlists={playlists}
              onPatch={patch}
              onEditContent={editContent}
              onDuplicate={duplicate}
              onDelete={remove}
            />
          ))}
        </div>
      </div>
    </>
  );
}
