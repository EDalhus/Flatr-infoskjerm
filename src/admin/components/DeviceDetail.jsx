import { useEffect, useState } from 'react';
import { Icon, Button, IconButton, Input, Select } from './ui.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import {
  codeDisplay,
  displayName,
  deviceStatus,
  timeAgo,
  fmtUptime,
  aspectOf
} from './pairingHelpers.js';

const HEADING = 'text-[11px] font-bold uppercase tracking-[0.14em] text-muted';

function Stat({ label, value, sub, pct }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="rounded-lg border border-hair bg-card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-ink">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
      {typeof pct === 'number' && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hair">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hair py-2 last:border-0">
      <span className="shrink-0 whitespace-nowrap text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      <span className="truncate font-mono text-sm text-ink">{value}</span>
    </div>
  );
}

export default function DeviceDetail({
  pairing: p,
  screens,
  onClose,
  onCommand,
  onSetLabel,
  onReassign,
  onUnpair
}) {
  const [editingName, setEditingName] = useState(false);
  const [labelDraft, setLabelDraft] = useState(p.label || '');

  const cancelEdit = () => {
    setLabelDraft(p.label || '');
    setEditingName(false);
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

  // Bytt enhet -> nullstill redigering.
  useEffect(() => {
    setEditingName(false);
    setLabelDraft(p.label || '');
  }, [p.device_id, p.label]);

  const ci = p.client_info || {};
  const status = deviceStatus(p);
  const paired = p.status === 'paired';
  const screen = screens.find((s) => s.id === p.screen_id);
  const orientation = screen?.orientation === 'portrait' ? 'portrait' : 'landscape';

  const saveName = () => {
    onSetLabel(labelDraft.trim());
    setEditingName(false);
  };

  return (
    <aside className="flex h-full flex-col bg-paper" style={{ animation: 'drawerIn 0.18s ease' }}>
      {/* topp */}
      <div className="flex shrink-0 items-start gap-3 border-b border-hair bg-card px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
          <Icon name="monitor" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {editingName ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveName();
                }}
              >
                <Input
                  autoFocus
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  placeholder={ci.device_name || 'Kallenavn'}
                  className="h-8 text-sm"
                />
                <IconButton name="check" label="Lagre" tone="brand" type="submit" />
                <IconButton name="x" label="Avbryt" onClick={cancelEdit} />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                title="Endre kallenavn"
                className="group flex min-w-0 items-center gap-1.5 text-left"
              >
                <span className="truncate text-lg font-black text-ink">{displayName(p)}</span>
                <Icon
                  name="edit"
                  className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            )}
            {!editingName && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.cls}`}
              >
                {status.label}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="font-mono">{codeDisplay(p.code)}</span>
            {p.screen_name && <span>· {p.screen_name}</span>}
            {paired && p.last_seen && <span>· sist sett {timeAgo(p.last_seen)}</span>}
          </div>
        </div>
        <IconButton name="x" label="Lukk" onClick={onClose} />
      </div>

      {/* alt på én side */}
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {/* live-visning */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className={HEADING}>Live</h3>
            {p.screen_id && (
              <a
                href={`/admin?view=screens&edit=${p.screen_id}`}
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand hover:underline"
              >
                Rediger lysbilder
              </a>
            )}
          </div>
          {p.screen_id ? (
            <LiveScreenView screenId={p.screen_id} orientation={orientation} />
          ) : (
            <p className="text-sm text-muted">Enheten er ikke koblet til en kanal ennå.</p>
          )}
        </section>

        {/* handlinger */}
        {paired && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onCommand('identify', 'Identifiser')}>
              <Icon name="pin" className="h-4 w-4" />
              Identifiser
            </Button>
            <Button size="sm" variant="outline" onClick={() => onCommand('reload', 'Last inn')}>
              Last inn
            </Button>
            <Button size="sm" variant="outline" onClick={() => onCommand('clear_cache', 'Tøm cache')}>
              Tøm cache
            </Button>
            <Button size="sm" variant="outline" onClick={() => onCommand('reboot', 'Restart')}>
              Restart
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={onUnpair}
              title="Enheten kobles fra og viser en ny parringskode"
            >
              <Icon name="x" className="h-4 w-4" />
              Opphev parring
            </Button>
          </div>
        )}

        {/* innstillinger */}
        {paired && (
          <section className="space-y-2">
            <h3 className={HEADING}>Innstillinger</h3>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Kanal
              </div>
              <Select value={p.screen_id ?? ''} onChange={(e) => onReassign(Number(e.target.value))}>
                {screens.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.location ? ` – ${s.location}` : ''}
                  </option>
                ))}
              </Select>
            </div>
          </section>
        )}

        {/* telemetri */}
        <section className="space-y-2">
          <h3 className={HEADING}>Telemetri</h3>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Modell" value={ci.model} />
            <Stat
              label="OS"
              value={ci.os_version || (ci.tvos_version ? `tvOS ${ci.tvos_version}` : null)}
            />
            <Stat label="App" value={ci.app_version || ci.player_version} />
            <Stat
              label="Oppløsning"
              value={ci.resolution ? ci.resolution.replace('x', '×') : null}
              sub={aspectOf(ci.resolution)}
            />
            <Stat label="Tilkoblet tid" value={fmtUptime(ci.uptime_seconds)} />
            <Stat label="Sist sett" value={p.last_seen ? timeAgo(p.last_seen) : null} />
            <Stat
              label="Lagring"
              value={ci.storage_pct != null ? `${ci.storage_pct}%` : null}
              pct={ci.storage_pct}
            />
            <Stat
              label="Minne"
              value={ci.memory_pct != null ? `${ci.memory_pct}%` : null}
              pct={ci.memory_pct}
            />
            <Stat label="CPU-temp" value={ci.cpu_temp != null ? `${ci.cpu_temp}°C` : null} />
            <Stat label="GPU-temp" value={ci.gpu_temp != null ? `${ci.gpu_temp}°C` : null} />
          </div>
        </section>

        {/* detaljer – nederst */}
        <section className="space-y-2">
          <h3 className={HEADING}>Detaljer</h3>
          <div className="rounded-lg border border-hair bg-card px-4 py-1">
            <InfoRow label="IP-adresse" value={ci.ip} />
            <InfoRow label="Hostname" value={ci.hostname} />
            <InfoRow label="Paret" value={p.paired_at ? timeAgo(p.paired_at) : null} />
            <InfoRow label="Device-ID" value={p.device_id} />
          </div>
        </section>
      </div>
    </aside>
  );
}
