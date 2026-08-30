import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatTime, partitionSchedule } from '../lib/time.js';
import { downloadIcs } from '../lib/ics.js';
import { useNow } from '../hooks/useNow.js';

const STATUS_LABEL = { live: 'Pågår nå', scheduled: '', done: 'Ferdig', cancelled: 'Avlyst' };
const STATUS_COLOR = { live: 'text-ok', done: 'text-muted', cancelled: 'text-danger' };
const dayKey = (iso) => new Date(iso).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });

const CACHE_KEY = 'flatr.publicSchedule';

export default function Schedule() {
  const { screenId } = useParams();
  const now = useNow(1000);
  const [data, setData] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState({});

  const load = () =>
    Promise.all([
      api.schedule.list(),
      api.categories.list(),
      screenId ? api.screens.list().then((r) => (r || []).find((s) => String(s.id) === String(screenId))) : null
    ])
      .then(([schedule, categories, screen]) => {
        const next = { schedule: schedule || [], categories: categories || [], screen: screen || null };
        setData(next);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});

  useEffect(() => {
    load();
    const id = setInterval(load, 45_000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [screenId]);

  useEffect(() => {
    document.title = data?.screen?.name ? `Program · ${data.screen.name}` : 'Program';
  }, [data]);

  const schedule = data?.schedule || [];
  const catMap = useMemo(
    () => Object.fromEntries((data?.categories || []).map((c) => [c.id, c])),
    [data]
  );
  const { nowItem, nextItem } = partitionSchedule(schedule, now);

  const days = useMemo(() => {
    const map = new Map();
    for (const it of [...schedule].sort((a, b) => new Date(a.start_time) - new Date(b.start_time))) {
      if (!it.start_time) continue;
      const k = dayKey(it.start_time);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return [...map.entries()];
  }, [schedule]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-paper text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-black">{data?.screen?.name || 'Program'}</div>
            {data?.screen?.location && (
              <div className="truncate text-xs text-muted">{data.screen.location}</div>
            )}
          </div>
          <div className="font-mono text-lg font-bold tabular-nums">
            {now.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        {(nowItem || nextItem) && (
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {nowItem && (
              <div className="rounded-xl border border-ok/40 bg-ok-tint p-3">
                <div className="text-xs font-bold uppercase tracking-widest text-ok">Nå</div>
                <div className="mt-0.5 font-bold">{nowItem.title}</div>
                <div className="text-sm text-muted">
                  {formatTime(nowItem.start_time)}
                  {nowItem.stage ? ` · ${nowItem.stage}` : ''}
                </div>
              </div>
            )}
            {nextItem && (
              <div className="rounded-xl border border-hair bg-card p-3">
                <div className="text-xs font-bold uppercase tracking-widest text-muted">Neste</div>
                <div className="mt-0.5 font-bold">{nextItem.title}</div>
                <div className="text-sm text-muted">
                  {formatTime(nextItem.start_time)}
                  {nextItem.stage ? ` · ${nextItem.stage}` : ''}
                </div>
              </div>
            )}
          </div>
        )}

        {schedule.length > 0 && (
          <button
            onClick={() => downloadIcs(schedule, 'program.ics', data?.screen?.name || 'Program')}
            className="mb-4 w-full rounded-lg border border-line bg-card py-2 text-sm font-semibold text-brand"
          >
            Legg hele programmet i kalender (.ics)
          </button>
        )}

        {days.length === 0 && <p className="py-16 text-center text-muted">Programmet er ikke klart ennå.</p>}

        {days.map(([day, items]) => (
          <section key={day} className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-muted">{day}</h2>
            <ol className="overflow-hidden rounded-xl border border-hair bg-card">
              {items.map((it) => {
                const status = it.effective_status || it.status;
                const cat = catMap[it.category_id];
                const isOpen = open[it.id];
                return (
                  <li key={it.id} className="border-b border-hair last:border-0">
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [it.id]: !o[it.id] }))}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left ${
                        status === 'live' ? 'bg-brand-tint/50' : ''
                      } ${status === 'done' || status === 'cancelled' ? 'opacity-50' : ''}`}
                    >
                      <span className="w-14 shrink-0 pt-0.5 font-mono text-sm font-semibold tabular-nums">
                        {formatTime(it.start_time)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold">{it.title}</span>
                          {cat && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
                              style={{ backgroundColor: `${cat.color}1f`, color: cat.color }}
                            >
                              {cat.name}
                            </span>
                          )}
                          {STATUS_LABEL[status] && (
                            <span
                              className={`text-[11px] font-semibold uppercase ${
                                STATUS_COLOR[status] || 'text-muted'
                              }`}
                            >
                              {STATUS_LABEL[status]}
                            </span>
                          )}
                        </span>
                        {it.stage && <span className="block text-xs text-muted">{it.stage}</span>}
                        {isOpen && it.description && (
                          <span className="mt-1 block text-sm text-muted">{it.description}</span>
                        )}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3 pl-[4.25rem]">
                        <button
                          onClick={() => downloadIcs([it], `${it.title}.ics`, it.title)}
                          className="text-xs font-semibold text-brand"
                        >
                          + Legg i kalender
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}

        <p className="py-6 text-center text-xs text-muted">Oppdateres automatisk</p>
      </main>
    </div>
  );
}
