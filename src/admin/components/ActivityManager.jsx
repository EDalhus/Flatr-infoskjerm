// Aktivitet: hvem gjorde hva, og når (src/api/activity.js). Gruppert per dag,
// med søk og «Vis flere».

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, Input, Button, PageHeader, ErrorText } from './ui.jsx';

const initials = (s) =>
  String(s || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const ICON = { playlist: 'layers', screen: 'monitor', media: 'image', app: 'sparkle', schedule: 'calendar', settings: 'lock', alerts: 'megaphone' };

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'I dag';
  if (d.toDateString() === yesterday.toDateString()) return 'I går';
  return d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function ActivityManager({ onNavigate }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async (append = false) => {
    setBusy(true);
    try {
      const before = append && rows?.length ? rows[rows.length - 1].id : undefined;
      const next = await api.activity(before, q.trim() || undefined);
      setRows((r) => (append ? [...(r || []), ...next] : next));
      setMore(next.length === 50);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => load(false), q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const days = [];
  for (const r of rows || []) {
    const key = new Date(r.at).toDateString();
    let day = days.find((d) => d.key === key);
    if (!day) days.push((day = { key, label: dayLabel(r.at), rows: [] }));
    day.rows.push(r);
  }

  return (
    <>
      <PageHeader title="Aktivitet" subtitle="Hvem som har endret hva, og når. Lagres i et halvt år." />
      <div className="mx-auto w-full max-w-4xl space-y-5 px-6 pb-12 pt-4 sm:px-8">
        <label className="flex items-center gap-2">
          <Icon name="search" className="h-4 w-4 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk på person, presentasjon, skjerm …" />
        </label>
        <ErrorText>{error}</ErrorText>
        {rows && !rows.length && <p className="py-10 text-center text-sm text-muted">{q ? 'Ingen treff.' : 'Ingen aktivitet ennå.'}</p>}
        {days.map((d) => (
          <section key={d.key}>
            <h2 className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{d.label}</h2>
            <ul className="m-0 list-none divide-y divide-hair overflow-hidden rounded-2xl border border-hair bg-card p-0">
              {d.rows.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-tint text-[11px] font-bold text-brand">{initials(r.user_name || r.user_email)}</span>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="text-ink">
                      <strong>{r.user_name || r.user_email || 'Noen'}</strong> {r.action}
                      {r.target_name && (
                        <>
                          {' '}
                          {r.target_type === 'playlist' && r.target_id ? (
                            <button type="button" onClick={() => onNavigate?.('playlists', { edit: r.target_id })} className="font-semibold text-brand hover:underline">
                              «{r.target_name}»
                            </button>
                          ) : (
                            <strong>{r.target_name.startsWith('«') ? r.target_name : `«${r.target_name}»`}</strong>
                          )}
                        </>
                      )}
                      {r.count > 1 && <span className="text-muted"> · {r.count} endringer</span>}
                    </div>
                    {r.detail && <div className="mt-0.5 truncate text-xs text-muted">«{r.detail}»</div>}
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted">
                    {ICON[r.target_type] && <Icon name={ICON[r.target_type]} className="h-3.5 w-3.5" />}
                    {new Date(r.at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {rows?.length > 0 && more && (
          <Button variant="outline" onClick={() => load(true)} disabled={busy} className="mx-auto">
            {busy ? 'Henter …' : 'Vis flere'}
          </Button>
        )}
      </div>
    </>
  );
}
