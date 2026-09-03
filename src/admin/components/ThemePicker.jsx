import { useEffect, useState } from 'react';

// Temaene tilsvarer variabelsettene i src/index.css. `c` = [bakgrunn, aksent]
// for miniatyr-brikken.
export const THEMES = [
  { id: 'slate', label: 'Slate', c: ['#f6f6f7', '#f15a29'] },
  { id: 'aubergine', label: 'Aubergine', c: ['#2b0d40', '#bc17bf'] },
  { id: 'skog', label: 'Skog', c: ['#f2f2f2', '#027353'] },
  { id: 'lagune', label: 'Lagune', c: ['#f4f6f7', '#1f98a6'] },
  { id: 'mist', label: 'Tåke', c: ['#eeedf5', '#6c6ad9'] }
];

const KEY = 'flatr.theme';
const read = () => {
  try {
    return localStorage.getItem(KEY) || 'slate';
  } catch {
    return 'slate';
  }
};

export function applyTheme(id) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* privat modus e.l. – temaet holder bare for økten */
  }
}

export default function ThemePicker() {
  const [theme, setTheme] = useState(read);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const active = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
        Tema · <span className="text-ink">{active.label}</span>
      </div>
      <div className="flex gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            title={t.label}
            aria-pressed={t.id === theme}
            className={`h-7 w-7 shrink-0 overflow-hidden rounded-full border-2 transition-colors ${
              t.id === theme ? 'border-ink' : 'border-transparent hover:border-line'
            }`}
          >
            <span className="flex h-full w-full">
              <span className="w-1/2" style={{ background: t.c[0] }} />
              <span className="w-1/2" style={{ background: t.c[1] }} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
