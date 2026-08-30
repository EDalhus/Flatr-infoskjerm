import { useMemo } from 'react';
import { formatTime, minutesUntil, partitionSchedule } from '../../lib/time.js';
import { filterSchedule } from '../../lib/slides.js';
import SlideFrame from './SlideFrame.jsx';

const STATUS_STYLES = {
  live: 'bg-ok-tint text-ok border-ok/30',
  scheduled: 'bg-hair text-muted border-line',
  done: 'bg-hair text-muted/70 border-line',
  cancelled: 'bg-danger-tint text-danger border-danger/30'
};
const STATUS_LABEL = { live: 'Pågår', scheduled: 'Planlagt', done: 'Ferdig', cancelled: 'Avlyst' };

function CategoryBadge({ category }) {
  if (!category) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold"
      style={{ backgroundColor: `${category.color}1f`, color: category.color }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
      {category.name}
    </span>
  );
}

function BigCard({ label, item, now, accent, catMap, showCategory }) {
  const category = showCategory ? catMap[item?.category_id] : null;
  return (
    <div
      className={`flex-1 rounded-2xl border p-6 ${
        accent ? 'border-ok/40 bg-ok-tint' : 'border-hair bg-paper'
      }`}
    >
      <div
        className={`text-sm font-bold uppercase tracking-[0.2em] ${accent ? 'text-ok' : 'text-muted'}`}
      >
        {label}
      </div>
      {item ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-3xl font-extrabold leading-tight text-ink portrait:text-2xl">
              {item.title}
            </span>
            <CategoryBadge category={category} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-lg text-muted">
            <span className="font-semibold text-ink">
              {formatTime(item.start_time)}
              {item.end_time ? `–${formatTime(item.end_time)}` : ''}
            </span>
            {item.stage && <span>· {item.stage}</span>}
            {!accent && <span>· om {Math.max(0, minutesUntil(item.start_time, now))} min</span>}
          </div>
          {item.description && (
            <p className="mt-3 line-clamp-2 text-base text-muted">{item.description}</p>
          )}
        </>
      ) : (
        <div className="mt-3 text-xl text-muted">Ingenting planlagt</div>
      )}
    </div>
  );
}

export default function ProgramSlide({ slide, ctx }) {
  const cfg = slide.config || {};
  const mode = cfg.mode || 'agenda';
  const showCategory = cfg.showCategory !== false;
  const { schedule, categories, now } = ctx;

  const catMap = useMemo(
    () => Object.fromEntries((categories || []).map((c) => [c.id, c])),
    [categories]
  );
  const items = useMemo(() => filterSchedule(schedule || [], cfg), [schedule, cfg]);
  const { sorted, nowItem, nextItem, upcoming } = partitionSchedule(items, now);

  if (mode === 'nowNext' || mode === 'next') {
    return (
      <SlideFrame title={slide.title || 'Program'}>
        <div className="flex h-full gap-4 portrait:flex-col">
          <BigCard
            label="Nå på scenen"
            item={nowItem}
            now={now}
            accent
            catMap={catMap}
            showCategory={showCategory}
          />
          {mode === 'nowNext' && (
            <BigCard
              label="Neste ut"
              item={nextItem}
              now={now}
              catMap={catMap}
              showCategory={showCategory}
            />
          )}
        </div>
      </SlideFrame>
    );
  }

  const list = [...(nowItem ? [nowItem] : []), ...upcoming].slice(0, Math.max(1, cfg.max || 10));
  const rows = list.length ? list : sorted.slice(0, Math.max(1, cfg.max || 10));

  return (
    <SlideFrame title={slide.title || 'Program'} pad={false}>
      <ol className="h-full divide-y divide-hair overflow-hidden">
        {rows.length === 0 && <li className="p-6 text-muted">Ingen programposter.</li>}
        {rows.map((item) => {
          const status = item.effective_status || item.status;
          const category = showCategory ? catMap[item.category_id] : null;
          return (
            <li
              key={item.id}
              className={`flex items-start gap-5 px-6 py-4 ${status === 'live' ? 'bg-brand-tint/60' : ''}`}
            >
              <div className="w-20 shrink-0 pt-1 font-mono text-lg font-semibold tabular-nums text-ink">
                {formatTime(item.start_time)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl font-bold text-ink">{item.title}</span>
                  <CategoryBadge category={category} />
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                      STATUS_STYLES[status] || STATUS_STYLES.scheduled
                    }`}
                  >
                    {STATUS_LABEL[status] || status}
                  </span>
                </div>
                {item.stage && <div className="mt-0.5 text-sm text-muted">{item.stage}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </SlideFrame>
  );
}
