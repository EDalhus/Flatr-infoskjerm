export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 ' +
  'placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500';

export function Input(props) {
  return <input {...props} className={`${inputBase} ${props.className || ''}`} />;
}

export function Textarea(props) {
  return <textarea {...props} className={`${inputBase} ${props.className || ''}`} />;
}

export function Select(props) {
  return <select {...props} className={`${inputBase} ${props.className || ''}`} />;
}

export function Button({ variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-sky-600 hover:bg-sky-500 text-white',
    ghost: 'bg-slate-800 hover:bg-slate-700 text-slate-200',
    danger: 'bg-red-600/90 hover:bg-red-600 text-white'
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ title, actions, children }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50">
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="text-lg font-bold text-slate-100">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return (
    <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {children}
    </p>
  );
}
