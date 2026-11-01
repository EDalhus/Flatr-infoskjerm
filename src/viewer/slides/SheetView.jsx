import { FeedMessage } from './useFeed.jsx';

// Regneark (Flatr-appen «Regneark»): tabell, ett stort nøkkeltall eller en liste.

const isNumber = (v) => /\d/.test(v) && /^[-+]?[\d\s  .,]+\s?(%|kr|,-)?$/i.test(String(v).trim());

/** «B2» -> { row: 1, col: 1 }. */
export function cellRef(ref) {
  const m = /^([A-Z]{1,2})(\d{1,4})$/i.exec(String(ref || '').trim());
  if (!m) return null;
  const col = [...m[1].toUpperCase()].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  return { row: Number(m[2]) - 1, col };
}

/** Kolonnenavn: overskriftsraden, ellers A, B, C … */
export const columnNames = (rows, header) => {
  const width = Math.max(0, ...(rows || []).map((r) => r.length));
  return Array.from({ length: width }, (_, i) => (header && rows[0]?.[i]) || String.fromCharCode(65 + (i % 26)));
};

export default function SheetView({ data, sheetId, view = 'table', header = true, columns, max = 10, cell, label, column = 0, title }) {
  const sheets = data?.sheets || {};
  const sheet = sheets[sheetId] || Object.values(sheets)[0];
  if (!sheet) return <FeedMessage>Legg til et regneark i appen Regneark</FeedMessage>;
  const rows = sheet.rows || [];
  if (!rows.length) return <FeedMessage>{sheet.error || 'Regnearket er tomt'}</FeedMessage>;
  const limit = Math.max(1, Math.min(30, Number(max) || 10));

  if (view === 'value') {
    const ref = cellRef(cell || 'B2');
    const value = ref ? (rows[ref.row]?.[ref.col] ?? '') : '';
    const caption = label || title;
    return (
      <div className="flex h-full w-full flex-col items-center justify-center text-center" style={{ fontSize: 'min(9cqh, 6cqw)' }}>
        {caption && (
          <div className="mb-[0.15em] max-w-full truncate font-semibold opacity-75" style={{ fontSize: '0.55em' }}>
            {caption}
          </div>
        )}
        <div className="max-w-full truncate font-black leading-none tabular-nums" style={{ fontSize: '1.9em' }}>
          {value || '–'}
        </div>
      </div>
    );
  }

  if (view === 'list') {
    const items = rows
      .slice(header ? 1 : 0)
      .map((r) => r[column] || '')
      .filter(Boolean)
      .slice(0, limit);
    const lines = items.length + (title ? 1.4 : 0);
    return (
      <div className="flex h-full w-full flex-col" style={{ fontSize: `min(${(100 / (lines * 1.6 + 1)).toFixed(2)}cqh, 4.2cqw)` }}>
        {title && (
          <div className="mb-[0.4em] truncate font-bold" style={{ fontSize: '1.25em' }}>
            {title}
          </div>
        )}
        {items.map((it, i) => (
          <div key={i} className="flex min-w-0 items-baseline gap-[0.5em] leading-snug">
            <span className="opacity-60">•</span>
            <span className="min-w-0 truncate">{it}</span>
          </div>
        ))}
      </div>
    );
  }

  // Tabell
  const width = Math.max(0, ...rows.map((r) => r.length));
  const cols = (Array.isArray(columns) && columns.length ? columns : [...Array(Math.min(width, 8)).keys()]).filter((i) => i < width);
  const head = header ? rows[0] || [] : null;
  const body = rows.slice(header ? 1 : 0, (header ? 1 : 0) + limit);
  const numeric = cols.map((i) => {
    const values = body.map((r) => r[i]).filter(Boolean);
    return values.length > 0 && values.filter(isNumber).length / values.length > 0.6;
  });
  // Høyden deles på radene (en rad er ca. 1,7 skrifthøyder med luft), og overskriften.
  const lines = body.length + (head ? 1 : 0) + (title ? 1.8 : 0);
  return (
    <div
      className="flex h-full w-full flex-col justify-start overflow-hidden"
      style={{ fontSize: `min(${(100 / (lines * 1.9 + 0.5)).toFixed(2)}cqh, ${(100 / (Math.max(cols.length, 2) * 6.5)).toFixed(2)}cqw)` }}
    >
      {title && (
        <div className="mb-[0.4em] truncate font-bold" style={{ fontSize: '1.25em' }}>
          {title}
        </div>
      )}
      <table className="w-full border-collapse leading-tight" style={{ tableLayout: 'fixed' }}>
        {head && (
          <thead>
            <tr>
              {cols.map((i, k) => (
                <th key={i} className={`truncate px-[0.4em] pb-[0.3em] font-semibold opacity-70 ${numeric[k] ? 'text-right' : 'text-left'}`} style={{ fontSize: '0.8em' }}>
                  {head[i]}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((r, j) => (
            <tr key={j} style={{ background: j % 2 ? 'transparent' : 'rgba(0,0,0,0.2)' }}>
              {cols.map((i, k) => (
                <td key={i} className={`truncate px-[0.4em] py-[0.22em] ${numeric[k] ? 'text-right tabular-nums' : ''}`}>
                  {r[i]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
