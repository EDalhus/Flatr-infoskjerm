import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import { SLIDE_LAYOUTS, ELEMENT_LABEL } from '../../../lib/deck.js';
import { Icon } from '../ui.jsx';

function MiniSlide({ elements }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded"
      style={{ aspectRatio: '16 / 9', backgroundColor: '#16202b' }}
    >
      {(elements || []).map((el, i) => {
        const c = el.config || {};
        const st = { left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` };
        return (
          <div key={i} className="absolute overflow-hidden" style={st}>
            {el.kind === 'text' ? (
              <div
                className="h-full w-full overflow-hidden leading-tight"
                style={{ fontSize: 6, color: c.color || '#fff', textAlign: c.align || 'left', fontWeight: c.weight || 700 }}
              >
                {c.text}
              </div>
            ) : el.kind === 'image' ? (
              <div className="h-full w-full bg-white/15" />
            ) : el.kind === 'shape' ? (
              <div
                className="h-full w-full"
                style={{ background: c.fill || '#1f5566', borderRadius: c.shape === 'ellipse' ? '50%' : 2 }}
              />
            ) : (
              <div className="grid h-full w-full place-items-center rounded bg-white/85 text-[5px] font-bold uppercase text-brand">
                {ELEMENT_LABEL[el.kind] || el.kind}
              </div>
            )}
          </div>
        );
      })}
      {(!elements || elements.length === 0) && (
        <div className="grid h-full w-full place-items-center text-[10px] text-white/40">Tom</div>
      )}
    </div>
  );
}

export default function LayoutPicker({ onPick, onPickTemplate, onClose }) {
  const [templates, setTemplates] = useState([]);
  useEffect(() => {
    api.templates
      .list('slide')
      .then((r) => setTemplates(r || []))
      .catch(() => {});
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-hair bg-card shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-hair px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-ink">Velg et oppsett</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-hair">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {SLIDE_LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  onPick(l);
                  onClose();
                }}
                className="group rounded-lg border border-hair bg-paper p-1.5 text-left hover:border-brand"
              >
                <MiniSlide elements={l.elements} />
                <div className="truncate px-1 pt-1.5 text-xs font-semibold text-ink">{l.label}</div>
              </button>
            ))}
          </div>

          {templates.length > 0 && (
            <>
              <div className="mb-2 mt-6 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                Mine maler
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onPickTemplate(t);
                      onClose();
                    }}
                    className="rounded-lg border border-hair bg-paper p-1.5 text-left hover:border-brand"
                  >
                    <MiniSlide elements={t.payload?.elements} />
                    <div className="truncate px-1 pt-1.5 text-xs font-semibold text-ink">{t.name}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
