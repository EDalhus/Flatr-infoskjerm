// Detaljer for én skjerm i skuffen på Skjermer-siden: live-visning, hva den
// viser, fjernkontroll for Apple TV-en, innstillinger og info om spilleren.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAppKinds } from '../appsStore.js';
import { Icon, IconButton, Input, Select, Button } from './ui.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import { CodeInput, CopyLink } from './AddScreen.jsx';
import { StatusPill } from './screenStatus.jsx';
import { timeAgo, fmtUptime, aspectOf } from './pairingHelpers.js';
import HoursEditor from './HoursEditor.jsx';

// Fjernstyrt rotasjon for fysisk montering (grader).
const ROTATION_OPTIONS = [0, 90, 180, 270];

function Card({ title, action, children }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="m-0 text-sm font-bold text-ink">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function ActionButton({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-paper text-sm font-semibold text-ink transition-colors hover:bg-zone"
    >
      <Icon name={icon} className="h-4 w-4 text-muted" />
      {label}
    </button>
  );
}

/** Rad i spiller-lista. `pct` gir en liten måler under verdien. */
function Row({ label, value, sub, pct, mono }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-hair py-2.5 last:border-0">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <span className="min-w-0 text-right">
        <span className={`block truncate text-sm font-semibold text-ink ${mono ? 'font-mono text-xs' : ''}`}>
          {value}
          {sub && <span className="ml-1.5 font-normal text-muted">{sub}</span>}
        </span>
        {typeof pct === 'number' && (
          <span className="ml-auto mt-1 block h-1.5 w-24 overflow-hidden rounded-full bg-zone">
            <span className={`block h-full rounded-full ${pct > 85 ? 'bg-warn' : 'bg-brand'}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
          </span>
        )}
      </span>
    </div>
  );
}

/** Det Apple TV-en faktisk viser (skjermbilde fra appen), med knapp for et ferskt bilde. */
function TvScreenshot({ device, screenId, orientation }) {
  const [version, setVersion] = useState(device.screenshot_at || '');
  const [takenAt, setTakenAt] = useState(device.screenshot_at);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(!device.screenshot_at);

  const refresh = async () => {
    setBusy(true);
    try {
      await api.pairing.command({ screen_id: screenId, command: 'screenshot' });
    } catch {
      /* vises som gammelt bilde */
    }
    // TV-en tar bildet med en gang den får kommandoen; gi den litt tid til å laste det opp.
    setTimeout(() => {
      setVersion(String(Date.now()));
      setTakenAt(new Date().toISOString());
      setMissing(false);
      setBusy(false);
    }, 5000);
  };

  return (
    <div className="mb-3">
      <div className={`overflow-hidden rounded-xl bg-black ${orientation === 'portrait' ? 'mx-auto aspect-[9/16] w-1/2' : 'aspect-video w-full'}`}>
        {missing ? (
          <div className="grid h-full place-items-center px-4 text-center text-xs text-white/60">Ingen skjermbilde ennå</div>
        ) : (
          <img src={api.pairing.screenshotUrl(device.device_id, version)} alt="Slik ser TV-en ut" className={`h-full w-full object-contain ${busy ? 'opacity-50' : ''}`} onError={() => setMissing(true)} />
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
        <span>{takenAt ? `Fra TV-en ${timeAgo(takenAt)}` : 'Skjermbilde fra TV-en'}</span>
        <button type="button" onClick={refresh} disabled={busy} className="font-semibold text-brand hover:underline disabled:opacity-50">
          {busy ? 'Henter …' : 'Oppdater'}
        </button>
      </div>
    </div>
  );
}

const NETWORK = { ethernet: 'Kabel', wifi: 'Wi-Fi', other: 'Annet' };

const Label = ({ children }) => <span className="mb-1.5 block text-xs font-semibold text-muted">{children}</span>;

/** Kodefelt for å koble en (ny) Apple TV til skjermen. */
function PairTv({ label, onSubmit, onCancel }) {
  const [code, setCode] = useState('');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) onSubmit(code);
      }}
    >
      <span className="text-xs text-muted">Tast koden som står på TV-en.</span>
      <CodeInput value={code} onChange={setCode} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={code.length < 6}>
          {label}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Avbryt
          </Button>
        )}
      </div>
    </form>
  );
}

export default function ScreenDetail({ screen: s, playlists, onClose, onCommand, onPatch, onEditContent, onTimetable, onReplaceTv, onUnpairTv, onDelete }) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(s.name);
  const appKinds = useAppKinds();
  const [location, setLocation] = useState(s.location || '');
  const [tagsDraft, setTagsDraft] = useState((s.tags || []).join(', '));
  const [pairing, setPairing] = useState(false);

  const d = s.device;
  const ci = d?.client_info || {};
  const link = `${window.location.origin}/display/${s.id}`;

  const cancelEdit = () => {
    setNameDraft(s.name);
    setEditingName(false);
  };
  const saveName = () => {
    if (nameDraft.trim() && nameDraft.trim() !== s.name) onPatch({ name: nameDraft.trim() }, 'Navn lagret.');
    setEditingName(false);
  };
  const saveTags = () => {
    const next = tagsDraft.split(',').map((t) => t.trim()).filter(Boolean);
    if (next.join(',') !== (s.tags || []).join(',')) onPatch({ tags: next });
  };
  const saveLocation = () => location.trim() !== (s.location || '') && onPatch({ location: location.trim() || null });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (editingName) cancelEdit();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, editingName, s.name]);

  return (
    <aside className="flex h-full flex-col bg-paper">
      <header className="flex shrink-0 items-start gap-3 border-b border-line bg-card px-5 py-4">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                saveName();
              }}
            >
              <Input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Navn på skjermen" />
              <IconButton name="check" label="Lagre navn" tone="brand" type="submit" />
              <IconButton name="x" label="Avbryt" onClick={cancelEdit} />
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEditingName(true)} title="Gi skjermen nytt navn" className="group flex min-w-0 items-center gap-1.5 text-left">
                <span className="truncate text-xl font-bold text-ink">{s.name}</span>
                <Icon name="edit" className="h-4 w-4 shrink-0 text-muted opacity-60 transition-opacity group-hover:opacity-100" />
              </button>
              <StatusPill s={s} />
            </div>
          )}
          {d && !d.online && d.last_seen && (
            <p className="m-0 mt-1 text-sm text-muted">
              Sist sett {timeAgo(d.last_seen)} · TV-en viser fortsatt sist lagrede innhold og følger åpningstidene til den får nett igjen.
            </p>
          )}
        </div>
        <IconButton name="x" label="Lukk" onClick={onClose} />
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <Card title="Live">
          <LiveScreenView screenId={s.id} orientation={s.orientation} />
        </Card>

        <Card title="Innhold">
          <div className="space-y-3">
            <label className="block">
              <Label>Viser presentasjonen</Label>
              <div className="flex gap-2">
                <Select
                  value={s.playlist_id ?? ''}
                  onChange={(e) => onPatch({ playlist_id: e.target.value ? Number(e.target.value) : null }, 'Skjermen viser ny presentasjon.')}
                >
                  <option value="">Ingenting</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Button variant="outline" disabled={!s.playlist_id} onClick={() => onEditContent(s.playlist_id)}>
                  <Icon name="edit" className="h-4 w-4" />
                  Rediger
                </Button>
              </div>
            </label>
            {(!appKinds || appKinds.has('timetable') || s.now_slot || s.now_off) && (
            <button
              type="button"
              onClick={onTimetable}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5 text-left text-sm hover:bg-zone"
            >
              <Icon name="clock" className="h-4 w-4 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">Tidsplan</span>
                <span className="block truncate text-xs text-muted">
                  {s.now_closed
                    ? 'Skjermen er av nå – utenfor åpningstid'
                    : s.now_off
                    ? 'Skjermen er av nå ifølge tidsplanen'
                    : s.now_slot
                      ? `Nå: ${s.now_playlist_name || s.now_slot.title} (overstyrer presentasjonen over)`
                      : 'Vis andre presentasjoner til bestemte tider'}
                </span>
              </span>
              <Icon name="chevron" className="h-4 w-4 text-muted" />
            </button>
            )}
          </div>
        </Card>

        {d && (
          <Card title="Fjernkontroll">
            <TvScreenshot key={d.device_id} device={d} screenId={s.id} orientation={s.orientation} />
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon="pin" label="Identifiser" onClick={() => onCommand('identify', 'Identifiser')} />
              <ActionButton icon="refresh" label="Last inn" onClick={() => onCommand('reload', 'Last inn')} />
              <ActionButton icon="trash" label="Tøm cache" onClick={() => onCommand('clear_cache', 'Tøm cache')} />
              <ActionButton icon="power" label="Start på nytt" onClick={() => onCommand('reboot', 'Restart')} />
            </div>
          </Card>
        )}

        <Card title="Innstillinger">
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="block">
                <Label>Plassering</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onBlur={saveLocation}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  placeholder="1. etasje"
                />
              </label>
              <label className="block">
                <Label>Rotasjon</Label>
                <Select value={s.rotation ?? 0} onChange={(e) => onPatch({ rotation: Number(e.target.value) })} className="!w-24" title="For skjermer som henger på høykant eller opp-ned">
                  {[...new Set([...ROTATION_OPTIONS, s.rotation ?? 0])].map((r) => (
                    <option key={r} value={r}>
                      {r}°
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <label className="block">
              <Label>Grupper</Label>
              <Input
                value={tagsDraft}
                onChange={(e) => setTagsDraft(e.target.value)}
                onBlur={saveTags}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                placeholder="2. etasje, Resepsjon"
              />
              <span className="mt-1 block text-xs text-muted">Skill med komma. Bruk grupper til å sende varsler, velge og endre mange skjermer samtidig.</span>
            </label>
          </div>
        </Card>

        <Card title="Åpningstider">
          <HoursEditor value={s.hours} onSave={(hours) => onPatch({ hours }, 'Åpningstidene er lagret.')} />
        </Card>

        <Card title="Apple TV">
          {d && !pairing ? (
            <>
              <Row label="Navn på TV-en" value={ci.device_name} />
              <Row label="Modell" value={ci.model} />
              <Row label="Operativsystem" value={ci.os_version || (ci.tvos_version ? `tvOS ${ci.tvos_version}` : null)} />
              <Row label="Flatr-app" value={ci.app_version || ci.player_version} />
              <Row label="Oppløsning" value={ci.resolution ? ci.resolution.replace('x', '×') : null} sub={aspectOf(ci.resolution)} />
              <Row label="Oppetid" value={fmtUptime(ci.uptime_seconds)} />
              <Row label="Nettverk" value={NETWORK[ci.network] || ci.network} />
              <Row label="Sanntid" value={ci.live == null ? null : ci.live ? 'Tilkoblet' : 'Ikke tilkoblet – henter hvert 30. sekund'} />
              <Row label="Innhold hentet" value={ci.content_at ? timeAgo(ci.content_at) : null} />
              <Row label="Automatiske omstarter" value={ci.restarts ? `${ci.restarts} siden appen startet` : null} />
              <Row label="Lagring" value={ci.storage_pct != null ? `${ci.storage_pct} %` : null} pct={ci.storage_pct} />
              <Row label="Minne" value={ci.memory_pct != null ? `${ci.memory_pct} %` : null} pct={ci.memory_pct} />
              <Row label="CPU-temperatur" value={ci.cpu_temp != null ? `${ci.cpu_temp} °C` : null} />
              <Row label="GPU-temperatur" value={ci.gpu_temp != null ? `${ci.gpu_temp} °C` : null} />
              <Row label="IP-adresse" value={ci.ip} mono />
              <Row label="Koblet til" value={d.paired_at ? timeAgo(d.paired_at) : null} />
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPairing(true)}>
                  Bytt TV
                </Button>
                <Button variant="outline" size="sm" onClick={onUnpairTv}>
                  Koble fra TV-en
                </Button>
              </div>
            </>
          ) : pairing ? (
            <PairTv
              label="Koble til"
              onSubmit={(code) => {
                onReplaceTv(code);
                setPairing(false);
              }}
              onCancel={() => setPairing(false)}
            />
          ) : (
            <>
              <p className="m-0 mb-3 text-sm text-muted">Ingen Apple TV er koblet til. Skjermen kan fortsatt vises i en nettleser.</p>
              <Button variant="outline" size="sm" onClick={() => setPairing(true)}>
                Koble til en Apple TV
              </Button>
            </>
          )}
        </Card>

        <Card title="Vis i nettleser">
          <p className="m-0 mb-2 text-xs text-muted">For smart-TV, PC eller annen skjerm med nettleser.</p>
          <CopyLink link={link} />
        </Card>

        <section className="flex items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger-tint/40 p-4">
          <div className="min-w-0">
            <div className="text-sm font-bold text-ink">Slett skjermen</div>
            <div className="text-xs text-muted">Presentasjonen beholdes. En Apple TV som er koblet til viser en ny kode.</div>
          </div>
          <button type="button" onClick={onDelete} className="h-10 shrink-0 rounded-xl bg-danger-tint px-4 text-sm font-semibold text-danger hover:bg-danger-hover">
            Slett
          </button>
        </section>
      </div>
    </aside>
  );
}
