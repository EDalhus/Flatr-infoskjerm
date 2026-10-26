// Felles for medielysbilder og dokumentimport i editoren.
import { Icon } from '../ui.jsx';

export const hostOf = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** Lengden på en videofil i hele sekunder (null hvis den ikke kan leses). */
export function videoSeconds(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = (val) => {
      v.removeAttribute('src');
      resolve(val);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.max(2, Math.ceil(v.duration)) : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

const PHASE = {
  upload: 'Laster opp',
  queued: 'Venter',
  converting: 'Konverterer dokumentet',
  rendering: 'Lager lysbilder',
  saving: 'Lagrer'
};

export function ImportBanner({ state, onClose }) {
  const pct =
    state.phase === 'upload'
      ? Math.round((state.upload || 0) * 100)
      : state.total
        ? Math.round((state.done / state.total) * 100)
        : null;
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line bg-brand-tint px-4 py-2.5 text-sm">
      <Icon name="layers" className="h-4 w-4 shrink-0 text-brand" />
      <span className="min-w-0 flex-1 truncate text-ink">
        <span className="font-semibold">{state.name}</span>
        {state.error ? (
          <span className="text-danger"> · {state.error}</span>
        ) : (
          <span className="text-muted">
            {' '}
            · {PHASE[state.phase] || 'Jobber'}
            {state.phase !== 'upload' && state.total ? ` (${state.done}/${state.total} sider)` : ''} …
          </span>
        )}
      </span>
      {!state.error && pct != null && (
        <span className="h-1.5 w-40 shrink-0 overflow-hidden rounded-full bg-card">
          <span className="block h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </span>
      )}
      {state.error && (
        <button type="button" onClick={onClose} className="font-semibold text-brand hover:underline">
          Lukk
        </button>
      )}
    </div>
  );
}

