import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import {
  Icon,
  Field,
  Input,
  Select,
  Button,
  IconButton,
  Card,
  GroupCard,
  Row,
  MediaTile,
  PageHeader,
  ErrorText
} from './ui.jsx';

const ORIENTATION_OPTIONS = [
  { value: 'landscape', label: '16:9' },
  { value: 'portrait', label: '9:16' }
];

// Fjernstyrt rotasjon for fysisk montering (grader). Styres herfra, ikke fra TV-en.
const ROTATION_OPTIONS = [0, 90, 135, 180, 270];
import DeckEditor from './deck/DeckEditor.jsx';

function OnlineDot({ online }) {
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${online ? 'bg-ok' : 'bg-muted/50'}`}
      title={online ? 'Online' : 'Offline'}
    />
  );
}

function ScreenList({ onEdit, onChange }) {
  const [screens, setScreens] = useState([]);
  const [form, setForm] = useState({ name: '', location: '', orientation: 'landscape', rotation: 0 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.screens
      .list()
      .then((rows) => setScreens(rows || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const created = await api.screens.create({
        name: form.name,
        location: form.location || null,
        orientation: form.orientation,
        rotation: form.rotation
      });
      setForm({ name: '', location: '', orientation: 'landscape', rotation: 0 });
      await load();
      onChange?.();
      if (created?.id) onEdit(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const patchScreen = async (id, patch) => {
    setScreens((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    try {
      await api.screens.update(id, patch);
      onChange?.();
    } catch (err) {
      setError(err.message);
      load();
    }
  };

  const duplicate = async (id) => {
    try {
      await api.screens.duplicate(id);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Slette skjermen? Den havner i papirkurven med alle lysbilder.')) return;
    try {
      await api.screens.remove(id);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <>
      <PageHeader crumbs={['Visning', 'Skjermer']} />
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6 sm:p-8">
        <Card title="Ny skjerm">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="Navn">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Hovedscene"
              />
            </Field>
            <Field label="Plassering">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Storsalen"
              />
            </Field>
            <Field label="Orientering" hint="Design-lerretet lysbildene bygges på.">
              <Select
                value={form.orientation}
                onChange={(e) => setForm({ ...form, orientation: e.target.value })}
              >
                <option value="landscape">Liggende 16:9</option>
                <option value="portrait">Stående 9:16</option>
              </Select>
            </Field>
            <Field label="Rotasjon" hint="Roterer visningen for fysisk montering.">
              <Select
                value={form.rotation}
                onChange={(e) => setForm({ ...form, rotation: Number(e.target.value) })}
              >
                {ROTATION_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}°
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Oppretter …' : 'Opprett og rediger'}
              </Button>
            </div>
          </form>
          <div className="mt-3">
            <ErrorText>{error}</ErrorText>
          </div>
        </Card>

        {screens.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-muted">
            Ingen skjermer opprettet.
          </p>
        ) : (
          <GroupCard label={`Skjermer · ${screens.length}`} icon="monitor">
            {screens.map((s) => (
              <Row
                key={s.id}
                media={
                  <MediaTile tone="brand">
                    <Icon name="monitor" className="h-5 w-5" />
                  </MediaTile>
                }
                title={
                  <span className="flex items-center gap-2">
                    <OnlineDot online={s.online} />
                    {s.name} <span className="font-normal text-muted">#{s.id}</span>
                  </span>
                }
                meta={
                  <>
                    <Icon name="layers" className="h-3.5 w-3.5" />
                    <span>{s.slide_count ?? 0} lysbilder</span>
                    {s.rotation ? <span>· {s.rotation}° rotert</span> : null}
                    {s.location && <span>· {s.location}</span>}
                  </>
                }
                actions={
                  <>
                    <Select
                      value={s.orientation === 'portrait' ? 'portrait' : 'landscape'}
                      onChange={(e) => patchScreen(s.id, { orientation: e.target.value })}
                      className="w-[88px]"
                      title="Orientering (design-lerret)"
                    >
                      {ORIENTATION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={s.rotation ?? 0}
                      onChange={(e) => patchScreen(s.id, { rotation: Number(e.target.value) })}
                      className="w-[84px]"
                      title="Skjermrotasjon (fysisk montering)"
                    >
                      {ROTATION_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}°
                        </option>
                      ))}
                    </Select>
                    <IconButton name="x" label="Slett" tone="danger" onClick={() => remove(s.id)} />
                    <IconButton name="copy" label="Dupliser" onClick={() => duplicate(s.id)} />
                    <a
                      href={`${origin}/display/${s.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink hover:bg-hair"
                    >
                      <Icon name="external" className="h-3.5 w-3.5" />
                      Åpne
                    </a>
                    <Button size="sm" variant="outline" onClick={() => onEdit(s.id)}>
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

const initialEdit = () => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('edit');
  return v && /^\d+$/.test(v) ? Number(v) : null;
};

export default function ScreensManager({ onChange }) {
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
    <DeckEditor screenId={editingId} onBack={() => setEdit(null)} onChange={onChange} />
  ) : (
    <ScreenList onEdit={setEdit} onChange={onChange} />
  );
}
