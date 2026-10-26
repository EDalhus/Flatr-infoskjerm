import { useEffect, useState } from 'react';
import { Icon, Button, IconButton, Input, Select } from './ui.jsx';
import LiveScreenView from './LiveScreenView.jsx';
import { api } from '../../lib/api.js';
import {
  codeDisplay,
  displayName,
  deviceStatus,
  timeAgo,
  fmtUptime,
  aspectOf
} from './pairingHelpers.js';

const HEADING = 'text-xs font-semibold text-muted';

function Stat({ label, value, sub, pct }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="rounded-xl border border-hair bg-card p-3">
      <div className="text-[11px] font-semibold text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-ink">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
      {typeof pct === 'number' && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hair">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[rgb(var(--c-brand))] to-[rgb(var(--c-focus))]"
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
      <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted">
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
  onUnpair,
  onSetTags
}) {
  const [tagsDraft, setTagsDraft] = useState((p.tags || []).join(', '));
  const [asked, setAsked] = useState(false);
  const playlistId = screens.find((s) => s.id === p.screen_id)?.playlist_id;
  const saveTags = () => {
    const next = tagsDraft.split(',').map((t) => t.trim()).filter(Boolean);
    if (next.join(',') !== (p.tags || []).join(',')) onSetTags?.(next);
  };
  const askScreenshot = () => {
    setAsked(true);
    onCommand('screenshot', 'Skjermbilde-forespørsel');
    setTimeout(() => setAsked(false), 60_000);
  };
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
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand">
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
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.cls}`}
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
        {/* skjermbilde fra TV-en */}
        {paired && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className={HEADING}>Skjermbilde fra TV-en</h3>
              <button type="button" onClick={askScreenshot} disabled={asked} className="text-xs font-semibold text-brand hover:underline disabled:opacity-50">
                {asked ? 'Venter på TV-en …' : 'Ta nytt'}
              </button>
            </div>
            {p.screenshot_at ? (
              <figure className="m-0 space-y-1">
                <img
                  src={api.pairing.screenshotUrl(p.device_id, p.screenshot_at)}
                  alt={`Skjermbilde fra ${p.label || 'enheten'}`}
                  className="w-full rounded-xl border border-hair bg-black"
                />
                <figcaption className="text-xs text-muted">Tatt {timeAgo(p.screenshot_at)}</figcaption>
              </figure>
            ) : (
              <p className="m-0 text-sm text-muted">
                Ingen skjermbilde ennå. Krever Flatr-appen versjon med skjermbilde-støtte – trykk «Ta nytt».
              </p>
            )}
          </section>
        )}

        {/* live-visning */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className={HEADING}>Kanalens innhold nå</h3>
            {playlistId && (
              <a
                href={`/admin?view=playlists&edit=${playlistId}`}
                className="text-xs font-semibold text-brand hover:underline"
              >
                Rediger innhold
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
              <div className="mb-1 text-xs font-semibold text-muted">
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
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">Tagger (kommaseparert)</span>
              <Input
                value={tagsDraft}
                onChange={(e) => setTagsDraft(e.target.value)}
                onBlur={saveTags}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                placeholder="2. etasje, Resepsjon"
              />
            </label>
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
          <div className="rounded-xl border border-hair bg-card px-4 py-1">
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
