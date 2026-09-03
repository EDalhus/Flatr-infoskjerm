/* Delte UI-byggeklosser for admin – varm palett, gruppekort og listerader. */
import { forwardRef } from 'react';

const ICONS = {
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 9v6l13 5V4L4 9Z" />
      <path d="M4 9H2.5v6H4" />
      <path d="M17.5 9.5a3.5 3.5 0 0 1 0 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M17 7 7 17M7 7l10 10" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3.5 2" />
    </>
  ),
  check: <path d="M20 7 10 17l-5-5" />,
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  external: (
    <>
      <path d="M14 4h6v6M20 4l-8.5 8.5" />
      <path d="M19 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5.5" />
    </>
  ),
  logout: (
    <>
      <path d="M9 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  grip: (
    <>
      {[6, 12, 18].flatMap((y) =>
        [9, 15].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="currentColor" stroke="none" />
        ))
      )}
    </>
  ),
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  back: <path d="M19 12H5M12 19l-7-7 7-7" />,
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  tag: (
    <>
      <path d="M20 12 12 4H4v8l8 8z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  layers: <path d="m12 3 9 5-9 5-9-5 9-5zM3 14l9 5 9-5M3 18l9 5 9-5" />,
  text: <path d="M5 5h14M12 5v14M9 19h6" />,
  square: <rect x="4" y="4" width="16" height="16" rx="2" />,
  alignLeft: <path d="M4 6h16M4 12h10M4 18h13" />,
  alignCenter: <path d="M4 6h16M7 12h10M5 18h14" />,
  alignRight: <path d="M4 6h16M10 12h10M7 18h13" />,
  alignJustify: <path d="M4 6h16M4 12h16M4 18h16" />,
  shadow: (
    <>
      <rect x="4" y="4" width="12" height="12" rx="2" />
      <path d="M9 20h9a2 2 0 0 0 2-2V9" opacity="0.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Z" />
      <path d="m13.5 6.5 3 3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  )
};

export function Icon({ name, className = 'h-4 w-4' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[name] ?? null}
    </svg>
  );
}

/* ---------- knapper og felt ---------- */

export function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const sizes = {
    sm: 'h-9 rounded-lg px-3 text-xs uppercase tracking-[0.08em]',
    md: 'rounded-full px-4 py-2 text-sm'
  };
  const variants = {
    primary: 'bg-brand text-card hover:bg-brand-dark',
    outline: 'border border-line bg-card text-ink hover:bg-hair',
    ghost: 'text-brand hover:bg-brand-tint',
    danger: 'bg-danger-tint text-danger hover:bg-danger-hover'
  };
  return <button {...props} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} />;
}

export function IconButton({ name, label, tone = 'muted', className = '', ...props }) {
  const tones = {
    muted: 'text-muted hover:bg-hair hover:text-ink',
    brand: 'text-brand hover:bg-brand-tint',
    danger: 'text-danger hover:bg-danger-tint'
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-hair transition-colors ${tones[tone]} ${className}`}
    >
      <Icon name={name} className="h-4 w-4" />
    </button>
  );
}

// Felles: 36px høyde, rounded-lg, samme kant/fokus overalt.
const CONTROL = 'h-9 rounded-lg border border-line bg-white text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';
const inputBase = `w-full ${CONTROL} px-3 text-sm placeholder:text-muted/70`;

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} {...props} className={`${inputBase} ${className}`} />;
});
export const Textarea = forwardRef(function Textarea({ className = '', ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={`w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 ${className}`}
    />
  );
});
export const Select = forwardRef(function Select({ className = '', ...props }, ref) {
  return <select ref={ref} {...props} className={`${inputBase} ${className}`} />;
});

/** Fargevelger med samme høyde/kant som resten. */
export function ColorInput({ className = '', ...props }) {
  return (
    <input
      type="color"
      {...props}
      className={`h-9 w-full cursor-pointer rounded-lg border border-line bg-white p-1 ${className}`}
    />
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return (
    <p className="rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-sm font-medium text-danger">
      {children}
    </p>
  );
}

/* ---------- layout / kort ---------- */

export function PageHeader({ crumbs = [], action }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-paper/85 px-6 py-4 backdrop-blur sm:px-8">
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
        {crumbs.map((c, i) => (
          <span key={c} className="flex items-center gap-1.5">
            {i > 0 && <Icon name="chevron" className="h-3 w-3 text-muted/60" />}
            <span className={i === crumbs.length - 1 ? 'text-ink' : ''}>{c}</span>
          </span>
        ))}
      </nav>
      {action}
    </div>
  );
}

export function Card({ id, title, actions, children }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 overflow-hidden rounded-xl border border-hair bg-card shadow-card"
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-hair px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-ink">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function GroupCard({ label, icon, right, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-hair bg-card shadow-card">
      <header className="flex items-center justify-between gap-3 bg-zone px-5 py-2.5">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zoneink">
          {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
          {label}
        </div>
        {right}
      </header>
      <div className="divide-y divide-hair">{children}</div>
    </section>
  );
}

export function Row({ media, title, meta, actions, highlight }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5 ${
        highlight ? 'bg-brand-tint/50' : ''
      }`}
    >
      <Icon name="grip" className="hidden h-4 w-4 shrink-0 cursor-grab text-muted/50 sm:block" />
      {media}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-ink">{title}</div>
        {meta && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">{meta}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">{actions}</div>
    </div>
  );
}

export function MediaTile({ src, alt, tone = 'brand', children }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className="h-11 w-16 shrink-0 rounded-md border border-hair bg-white object-contain p-1"
      />
    );
  }
  const tones = {
    brand: 'bg-brand-tint text-brand',
    ok: 'bg-ok-tint text-ok',
    danger: 'bg-danger-tint text-danger',
    muted: 'bg-hair text-muted'
  };
  return (
    <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-md ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function NumberBadge({ children }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-badge text-xs font-bold text-badge-ink">
      {children}
    </span>
  );
}

export function MetaValue({ children }) {
  return (
    <span className="hidden text-xs font-semibold uppercase tracking-wide text-muted sm:inline">
      {children}
    </span>
  );
}

const cell = 'flex flex-1 items-center justify-center gap-1 px-2 text-xs font-semibold transition-colors';

/** Segmentert valg (eksklusivt). options: [{ value, label?, icon? }] */
export function Segmented({ value, onChange, options, className = '' }) {
  return (
    <div className={`flex h-9 overflow-hidden rounded-lg border border-line ${className}`}>
      {options.map((o, i) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`${cell} ${i > 0 ? 'border-l border-line' : ''} ${
              active ? 'bg-brand text-white' : 'bg-white text-muted hover:bg-hair'
            }`}
          >
            {o.icon ? <Icon name={o.icon} className="h-4 w-4" /> : o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Sammenkoblet knapperad. items: [{ key, label?, icon?, active?, onClick, title? }]
 * Hver celle har egen aktiv-status (toggles) eller er bare en handling.
 */
export function ButtonGroup({ items, className = '' }) {
  return (
    <div className={`flex h-9 overflow-hidden rounded-lg border border-line ${className}`}>
      {items.map((it, i) => (
        <button
          key={it.key}
          type="button"
          title={it.title}
          onClick={it.onClick}
          className={`${cell} ${i > 0 ? 'border-l border-line' : ''} ${
            it.active ? 'bg-brand text-white' : 'bg-white text-muted hover:bg-hair'
          }`}
        >
          {it.icon ? <Icon name={it.icon} className="h-4 w-4" /> : it.label}
        </button>
      ))}
    </div>
  );
}
