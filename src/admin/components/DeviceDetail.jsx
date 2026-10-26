// Detaljer for én TV i skuffen på Enheter-siden: live-visning, fjernkontroll,
// innstillinger og informasjon om spilleren.
import { useEffect, useState } from 'react';
import { Icon, IconButton, Input, Select } from './ui.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import { codeDisplay, displayName, timeAgo, fmtUptime, aspectOf } from './pairingHelpers.js';

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

function StatusPill({ p }) {
  if (p.status === 'pending') return <span className="shrink-0 rounded-full bg-badge px-2.5 py-0.5 text-xs font-bold text-badge-ink">Venter</span>;
  if (p.status === 'expired') return <span className="shrink-0 rounded-full bg-danger-tint px-2.5 py-0.5 text-xs font-bold text-danger">Utløpt</span>;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
        p.online ? 'bg-ok-tint text-ok' : 'bg-warn-tint text-warn'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${p.online ? 'bg-ok' : 'bg-warn'}`} aria-hidden="true" />
      {p.online ? 'Online' : 'Frakoblet'}
    </span>
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
            <span
              className={`block h-full rounded-full ${pct > 85 ? 'bg-warn' : 'bg-brand'}`}
              style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            />
          </span>
        )}
      </span>
    </div>
  );
}

export default function DeviceDetail({ pairing: p, screens, onClose, onCommand, onSetLabel, onReassign, onUnpair, onSetTags }) {
  const [tagsDraft, setTagsDraft] = useState((p.tags || []).join(', '));
  const [editingName, setEditingName] = useState(false);
  const [labelDraft, setLabelDraft] = useState(p.label || '');

  const ci = p.client_info || {};
  const paired = p.status === 'paired';
  const screen = screens.find((s) => s.id === p.screen_id);
  const orientation = screen?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const playlistId = screen?.playlist_id;

  const cancelEdit = () => {
    setLabelDraft(p.label || '');
    setEditingName(false);
  };
  const saveName = () => {
    onSetLabel(labelDraft.trim());
    setEditingName(false);
  };
  const saveTags = () => {
    const next = tagsDraft.split(',').map((t) => t.trim()).filter(Boolean);
    if (next.join(',') !== (p.tags || []).join(',')) onSetTags?.(next);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (editingName) cancelEdit();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, editingName, p.label]);

  return (
    <aside className="flex h-full flex-col bg-paper">
      {/* topp */}
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
              <Input autoFocus value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} placeholder={ci.device_name || 'Navn på TV-en'} />
              <IconButton name="check" label="Lagre navn" tone="brand" type="submit" />
              <IconButton name="x" label="Avbryt" onClick={cancelEdit} />
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingName(true)}
                title="Gi TV-en et navn"
                className="group flex min-w-0 items-center gap-1.5 text-left"
              >
                <span className="truncate text-xl font-bold text-ink">{displayName(p)}</span>
                <Icon name="edit" className="h-4 w-4 shrink-0 text-muted opacity-60 transition-opacity group-hover:opacity-100" />
              </button>
              <StatusPill p={p} />
            </div>
          )}
          <p className="m-0 mt-1 truncate text-sm text-muted">
            {p.screen_name ? `Viser «${p.screen_name}»` : 'Ingen skjerm'}
            {paired && p.last_seen && !p.online ? ` · sist sett ${timeAgo(p.last_seen)}` : ''}
          </p>
        </div>
        <IconButton name="x" label="Lukk" onClick={onClose} />
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {p.screen_id && (
          <Card
            title="Live"
            action={
              playlistId && (
                <a href={`/admin?view=playlists&edit=${playlistId}`} className="text-sm font-semibold text-brand hover:underline">
                  Rediger innhold
                </a>
              )
            }
          >
            <LiveScreenView screenId={p.screen_id} orientation={orientation} />
          </Card>
        )}

        {paired && (
          <Card title="Fjernkontroll">
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon="pin" label="Identifiser" onClick={() => onCommand('identify', 'Identifiser')} />
              <ActionButton icon="refresh" label="Last inn" onClick={() => onCommand('reload', 'Last inn')} />
              <ActionButton icon="trash" label="Tøm cache" onClick={() => onCommand('clear_cache', 'Tøm cache')} />
              <ActionButton icon="power" label="Start på nytt" onClick={() => onCommand('reboot', 'Restart')} />
            </div>
            <p className="m-0 mt-2.5 text-xs text-muted">«Identifiser» viser navnet stort på TV-en, så du ser hvilken som er hvilken.</p>
          </Card>
        )}

        {paired && (
          <Card title="Innstillinger">
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted">Viser skjermen</span>
                <Select value={p.screen_id ?? ''} onChange={(e) => onReassign(Number(e.target.value))}>
                  {screens.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.location ? ` – ${s.location}` : ''}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted">Tagger</span>
                <Input
                  value={tagsDraft}
                  onChange={(e) => setTagsDraft(e.target.value)}
                  onBlur={saveTags}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  placeholder="2. etasje, Resepsjon"
                />
                <span className="mt-1 block text-xs text-muted">Skill med komma. Brukes til å filtrere og endre mange TV-er samtidig.</span>
              </label>
            </div>
          </Card>
        )}

        <Card title="Spiller">
          <Row label="Modell" value={ci.model} />
          <Row label="Operativsystem" value={ci.os_version || (ci.tvos_version ? `tvOS ${ci.tvos_version}` : null)} />
          <Row label="Flatr-app" value={ci.app_version || ci.player_version} />
          <Row label="Oppløsning" value={ci.resolution ? ci.resolution.replace('x', '×') : null} sub={aspectOf(ci.resolution)} />
          <Row label="Tilkoblet i" value={fmtUptime(ci.uptime_seconds)} />
          <Row label="Sist sett" value={p.last_seen ? timeAgo(p.last_seen) : null} />
          <Row label="Lagring" value={ci.storage_pct != null ? `${ci.storage_pct} %` : null} pct={ci.storage_pct} />
          <Row label="Minne" value={ci.memory_pct != null ? `${ci.memory_pct} %` : null} pct={ci.memory_pct} />
          <Row label="CPU-temperatur" value={ci.cpu_temp != null ? `${ci.cpu_temp} °C` : null} />
          <Row label="GPU-temperatur" value={ci.gpu_temp != null ? `${ci.gpu_temp} °C` : null} />
          <Row label="IP-adresse" value={ci.ip} mono />
          <Row label="Koblet til" value={p.paired_at ? timeAgo(p.paired_at) : null} />
          <Row label="Kode" value={codeDisplay(p.code)} mono />
          <Row label="Enhets-ID" value={p.device_id} mono />
        </Card>

        {paired && (
          <section className="flex items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger-tint/40 p-4">
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink">Koble fra TV-en</div>
              <div className="text-xs text-muted">Den slutter å vise innhold og viser en ny kode.</div>
            </div>
            <button
              type="button"
              onClick={onUnpair}
              className="h-10 shrink-0 rounded-xl bg-danger-tint px-4 text-sm font-semibold text-danger hover:bg-danger-hover"
            >
              Koble fra
            </button>
          </section>
        )}
      </div>
    </aside>
  );
}
