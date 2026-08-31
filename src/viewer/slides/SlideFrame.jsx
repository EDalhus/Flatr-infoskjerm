export default function SlideFrame({ title, children, pad = true, className = '' }) {
  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden rounded-2xl border border-hair bg-card shadow-card ${className}`}
    >
      {title && (
        <div className="shrink-0 bg-zone px-6 py-3 text-lg font-bold uppercase tracking-wide text-zoneink">
          {title}
        </div>
      )}
      <div className={`min-h-0 flex-1 ${pad ? 'p-6' : ''}`}>{children}</div>
    </div>
  );
}

/** Ramme som forenkles når widgeten ligger på en canvas (beholder lys flate
 *  så innholdet er lesbart, men uten tittellinje/kant). */
export function Frame({ chromeless, title, pad = true, children }) {
  if (chromeless) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-card">
        <div className={`min-h-0 flex-1 ${pad ? 'p-4' : ''}`}>{children}</div>
      </div>
    );
  }
  return (
    <SlideFrame title={title} pad={pad}>
      {children}
    </SlideFrame>
  );
}
