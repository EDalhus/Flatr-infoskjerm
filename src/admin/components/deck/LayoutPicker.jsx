import { useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api.js';
import { SLIDE_LAYOUTS, ELEMENT_LABEL } from '../../../lib/deck.js';
import { Icon, Input, Button, Field } from '../ui.jsx';
import { MediaPicker } from '../MediaPicker.jsx';

// Hurtigvalg: ett lysbilde med mediet i fullskjerm.
const MEDIA_OPTIONS = [
  { id: 'image', label: 'Bilde', icon: 'image', hint: 'Fra biblioteket' },
  { id: 'video', label: 'Video', icon: 'play', hint: 'Fra biblioteket' },
  { id: 'youtube', label: 'YouTube', icon: 'play', hint: 'Lim inn lenke' },
  { id: 'web', label: 'Nettside', icon: 'external', hint: 'Lim inn adresse' },
  { id: 'document', label: 'Dokument', icon: 'layers', hint: 'PDF, PowerPoint, Word' }
];

function UrlForm({ kind, onSubmit, onCancel }) {
  const [url, setUrl] = useState('');
  const [refresh, setRefresh] = useState(15);
  const valid = /^https?:\/\//i.test(url.trim());
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(url.trim(), refresh);
      }}
      className="grid gap-3 rounded-xl border border-line bg-paper p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
    >
      <Field label={kind === 'youtube' ? 'YouTube-lenke' : 'Nettadresse'}>
        <Input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={kind === 'youtube' ? 'https://www.youtube.com/watch?v=…' : 'https://…'}
        />
      </Field>
      {kind === 'web' && (
        <Field label="Oppdater (min)">
          <Input type="number" min={0} value={refresh} onChange={(e) => setRefresh(Number(e.target.value) || 0)} className="!w-24" />
        </Field>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!valid}>
          Legg til
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Avbryt
        </Button>
      </div>
      <p className="m-0 text-xs text-muted sm:col-span-3">
        {kind === 'youtube'
          ? 'Spilles av når skjermen vises i en nettleser. Apple TV viser videoens forsidebilde.'
          : 'Vises levende i nettlesere. Apple TV får et skjermbilde som oppdateres automatisk.'}
      </p>
    </form>
  );
}

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
              <div className="grid h-full w-full place-items-center rounded bg-white/85 text-[5px] font-bold text-brand">
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

export default function LayoutPicker({ onPick, onPickTemplate, onPickMedia, onImportDocument, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [mode, setMode] = useState(null); // null | image | video | youtube | web
  const docRef = useRef(null);

  const chooseMedia = (id) => {
    if (id === 'document') return docRef.current?.click();
    setMode(id);
  };
  const done = (fn) => (...args) => {
    fn(...args);
    onClose();
  };
  useEffect(() => {
    api.templates
      .list('slide')
      .then((r) => setTemplates(r || []))
      .catch(() => {});
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-hair bg-card shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-hair px-5 py-3">
          <h2 className="m-0 text-base font-bold text-ink">Nytt lysbilde</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-hair">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {onPickMedia && (
            <>
              <div className="mb-2 text-xs font-semibold text-muted">Medier i fullskjerm</div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {MEDIA_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => chooseMedia(o.id)}
                    aria-pressed={mode === o.id}
                    className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors ${
                      mode === o.id ? 'border-brand bg-brand-tint' : 'border-hair bg-paper hover:border-brand'
                    }`}
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-tint text-brand">
                      <Icon name={o.icon} className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-ink">{o.label}</span>
                    <span className="text-xs text-muted">{o.hint}</span>
                  </button>
                ))}
              </div>
              <input
                ref={docRef}
                type="file"
                hidden
                accept=".pdf,.ppt,.pptx,.pps,.ppsx,.key,.odp,.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) done(onImportDocument)(f);
                }}
              />
              {(mode === 'youtube' || mode === 'web') && (
                <div className="mb-4">
                  <UrlForm
                    kind={mode}
                    onCancel={() => setMode(null)}
                    onSubmit={done((url, refresh) => onPickMedia({ kind: mode, url, refresh }))}
                  />
                </div>
              )}
              <div className="mb-2 mt-6 text-xs font-semibold text-muted">Oppsett</div>
            </>
          )}
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
              <div className="mb-2 mt-6 text-xs font-bold text-muted">
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
      {(mode === 'image' || mode === 'video') && (
        <MediaPicker
          kind={mode}
          onClose={() => setMode(null)}
          onPick={done((url, m) => onPickMedia({ kind: mode, url, name: m?.name }))}
        />
      )}
    </div>
  );
}
