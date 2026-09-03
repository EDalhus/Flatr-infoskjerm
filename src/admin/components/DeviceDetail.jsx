import { useEffect, useState } from 'react';
import { Icon, Button, IconButton, Input, Select } from './ui.jsx';
import DeckPreviewStrip from './DeckPreviewStrip.jsx';
import {
  codeDisplay,
  displayName,
  deviceStatus,
  timeAgo,
  fmtUptime,
  aspectOf
} from './pairingHelpers.js';

const TABS = [
  { id: 'oversikt', label: 'Oversikt' },
  { id: 'skjerm', label: 'Skjerm' },
  { id: 'innstillinger', label: 'Innstillinger' }
];

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
    <div className="flex items-center justify-between gap-4 border-b border-hair py-2 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
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
  const [tab, setTab] = useState('oversikt');
  const [labelDraft, setLabelDraft] = useState(p.label || '');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => setLabelDraft(p.label || ''), [p.label]);

  const ci = p.client_info || {};
  const status = deviceStatus(p);
  const paired = p.status === 'paired';

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-hair bg-paper shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* topp */}
        <div className="flex items-start gap-3 border-b border-hair bg-card px-5 py-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
            <Icon name="monitor" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-black text-ink">{displayName(p)}</h2>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.cls}`}
              >
                {status.label}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              <span className="font-mono">{codeDisplay(p.code)}</span>
              {p.screen_name && <span>· {p.screen_name}</span>}
              {paired && p.last_seen && <span>· sist sett {timeAgo(p.last_seen)}</span>}
            </div>
          </div>
          <IconButton name="x" label="Lukk" onClick={onClose} />
        </div>

        {/* faner */}
        <div className="flex gap-1 border-b border-hair bg-card px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {tab === 'oversikt' && (
            <div className="space-y-5">
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
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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

              <div className="rounded-lg border border-hair bg-card px-4 py-1">
                <InfoRow label="Skjerm" value={p.screen_name} />
                <InfoRow label="IP-adresse" value={ci.ip} />
                <InfoRow label="Hostname" value={ci.hostname} />
                <InfoRow label="Paret" value={p.paired_at ? timeAgo(p.paired_at) : null} />
                <InfoRow label="Device-ID" value={p.device_id} />
              </div>
            </div>
          )}

          {tab === 'skjerm' &&
            (p.screen_id ? (
              <div className="space-y-3">
                <DeckPreviewStrip screenId={p.screen_id} />
                <a
                  href={`/admin?view=screens&edit=${p.screen_id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink hover:bg-hair"
                >
                  <Icon name="edit" className="h-3.5 w-3.5" />
                  Rediger lysbilder
                </a>
              </div>
            ) : (
              <p className="text-sm text-muted">Enheten er ikke koblet til en skjerm ennå.</p>
            ))}

          {tab === 'innstillinger' && (
            <div className="max-w-md space-y-5">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                  Kallenavn
                </div>
                <div className="flex gap-2">
                  <Input
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    placeholder={ci.device_name || 'f.eks. Inngang venstre'}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSetLabel(labelDraft.trim())}
                    disabled={labelDraft.trim() === (p.label || '')}
                  >
                    Lagre
                  </Button>
                </div>
              </div>

              {paired && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                    Skjerm
                  </div>
                  <Select
                    value={p.screen_id ?? ''}
                    onChange={(e) => onReassign(Number(e.target.value))}
                  >
                    {screens.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.location ? ` – ${s.location}` : ''}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div className="border-t border-hair pt-4">
                <Button variant="danger" size="sm" onClick={onUnpair}>
                  <Icon name="x" className="h-4 w-4" />
                  Opphev parring
                </Button>
                <p className="mt-1.5 text-xs text-muted">
                  Enheten kobles fra og viser en ny parringskode.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
