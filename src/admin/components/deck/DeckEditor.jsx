import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/api.js';
import { ELEMENT_KINDS, ELEMENT_ICON, defaultElement } from '../../../lib/deck.js';
import { useCollab } from '../../../hooks/useCollab.js';
import { Icon, Button, ErrorText } from '../ui.jsx';
import SlideNavigator from './SlideNavigator.jsx';
import CanvasStage from './CanvasStage.jsx';
import Inspector from './Inspector.jsx';
import LayoutPicker from './LayoutPicker.jsx';
import PresenceStack from './PresenceStack.jsx';

const hostOf = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** Lengden på en videofil i hele sekunder (null hvis den ikke kan leses). */
function videoSeconds(url) {
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

function ImportBanner({ state, onClose }) {
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

// Editor for én spilleliste (rekkefølgen av lysbilder). Kanaler som viser
// spillelisten oppdateres live.
export default function DeckEditor({ playlistId, onBack, onChange }) {
  const [playlist, setPlaylist] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [slides, setSlides] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selSlide, setSelSlide] = useState(null);
  const [selEl, setSelEl] = useState(null);
  const [err, setErr] = useState('');
  const [widgetMenu, setWidgetMenu] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [snap, setSnap] = useState(true);
  const [importing, setImporting] = useState(null); // { name, phase, upload, done, total, error }
  const timers = useRef({});

  const reload = async (keepSlide) => {
    try {
      const [pl, deck, cats] = await Promise.all([
        api.playlists.get(playlistId),
        api.deck.get(playlistId),
        api.categories.list()
      ]);
      setPlaylist(pl || null);
      setNameDraft(pl?.name || '');
      setSlides(deck || []);
      setCategories(cats || []);
      setSelSlide((prev) => {
        const want = keepSlide ?? prev;
        return want && (deck || []).some((s) => s.id === want) ? want : (deck?.[0]?.id ?? null);
      });
    } catch (e) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    reload();
  }, [playlistId]);
  useEffect(() => {
    setSelEl(null);
  }, [selSlide]);

  const slide = slides.find((s) => s.id === selSlide) || null;
  const element = slide?.elements?.find((e) => e.id === selEl) || null;
  const orientation = playlist?.orientation === 'portrait' ? 'portrait' : 'landscape';

  const debounce = (key, fn, ms = 350) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, ms);
  };

  // ---- samarbeid (live) ----
  const collabRef = useRef(null);

  const onRemoteOp = useCallback((op) => {
    if (!op) return;
    if (op.k === 'el.patch') {
      setSlides((ss) =>
        ss.map((s) => ({
          ...s,
          elements: (s.elements || []).map((e) => (e.id === op.id ? { ...e, ...op.patch } : e))
        }))
      );
    } else if (op.k === 'el.add' && op.el) {
      setSlides((ss) =>
        ss.map((s) =>
          s.id === op.slideId
            ? {
                ...s,
                elements: (s.elements || []).some((e) => e.id === op.el.id)
                  ? s.elements
                  : [...(s.elements || []), op.el]
              }
            : s
        )
      );
    } else if (op.k === 'el.remove') {
      setSlides((ss) =>
        ss.map((s) => ({ ...s, elements: (s.elements || []).filter((e) => e.id !== op.id) }))
      );
      setSelEl((cur) => (cur === op.id ? null : cur));
    } else if (op.k === 'slide.patch') {
      setSlides((ss) => ss.map((s) => (s.id === op.id ? { ...s, ...op.patch } : s)));
    } else {
      // strukturell endring hos en annen – hent hele deck-et på nytt
      debounce('remote-reload', () => reload(), 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const collab = useCollab(`pl-${playlistId}`, { onOp: onRemoteOp });
  collabRef.current = collab;
  const sendOp = (op) => collabRef.current?.sendOp(op);

  useEffect(() => {
    collab.setFocus(selSlide);
  }, [selSlide, collab.setFocus]);
  useEffect(() => {
    collab.setSelect(selEl);
  }, [selEl, collab.setSelect]);

  const otherPeers = useMemo(
    () => collab.peers.filter((p) => p.id && p.id !== collab.selfId),
    [collab.peers, collab.selfId]
  );
  const slidePeers = useMemo(
    () => otherPeers.filter((p) => p.slide === selSlide),
    [otherPeers, selSlide]
  );

  const patchSlide = (sid, patch, commit) => {
    setSlides((ss) => ss.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
    debounce(`op-s${sid}`, () => sendOp({ k: 'slide.patch', id: sid, patch }), 40);
    if (commit)
      debounce(`s${sid}`, () =>
        api.deck.slide
          .update(sid, patch)
          .then(() => onChange?.())
          .catch((e) => setErr(e.message))
      );
  };

  const patchElement = (eid, patch, commit) => {
    setSlides((ss) =>
      ss.map((s) => ({
        ...s,
        elements: (s.elements || []).map((e) => (e.id === eid ? { ...e, ...patch } : e))
      }))
    );
    debounce(`op-e${eid}`, () => sendOp({ k: 'el.patch', id: eid, patch }), 40);
    if (commit)
      debounce(`e${eid}`, () =>
        api.deck.element.update(eid, patch).catch((e) => setErr(e.message))
      );
  };

  const addElement = async (kind) => {
    setWidgetMenu(false);
    if (!slide) return;
    const maxZ = slide.elements.reduce((m, e) => Math.max(m, e.z), -1);
    try {
      const created = await api.deck.element.create({ slide_id: slide.id, ...defaultElement(kind, maxZ + 1) });
      setSlides((ss) =>
        ss.map((s) => (s.id === slide.id ? { ...s, elements: [...s.elements, created] } : s))
      );
      setSelEl(created.id);
      sendOp({ k: 'el.add', slideId: slide.id, el: created });
    } catch (e) {
      setErr(e.message);
    }
  };

  const deleteElement = async (eid) => {
    try {
      await api.deck.element.remove(eid);
      setSlides((ss) =>
        ss.map((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== eid) }))
      );
      setSelEl(null);
      sendOp({ k: 'el.remove', id: eid });
    } catch (e) {
      setErr(e.message);
    }
  };

  const elementZ = async (eid, dir) => {
    if (!slide) return;
    const els = [...slide.elements].sort((a, b) => a.z - b.z || a.id - b.id);
    const i = els.findIndex((e) => e.id === eid);
    const j = i + dir;
    if (j < 0 || j >= els.length) return;
    try {
      await Promise.all([
        api.deck.element.update(els[i].id, { z: els[j].z }),
        api.deck.element.update(els[j].id, { z: els[i].z })
      ]);
      await reload(selSlide);
      sendOp({ k: 'deck.reload' });
    } catch (e) {
      setErr(e.message);
    }
  };

  const addSlide = async (layout) => {
    try {
      const s = await api.deck.slide.create({
        playlist_id: Number(playlistId),
        name: layout?.label,
        elements: layout?.elements || []
      });
      await reload(s.id);
      onChange?.();
      sendOp({ k: 'deck.reload' });
    } catch (e) {
      setErr(e.message);
    }
  };
  // Ett lysbilde med et medium i fullskjerm (bilde, video, YouTube, nettside).
  const addMediaSlide = async ({ kind, url, name, refresh }) => {
    const full = { x: 0, y: 0, w: 100, h: 100, z: 0, rotation: 0 };
    const spec = {
      image: { el: { kind: 'image', config: { url, fit: 'contain', radius: 0 } }, title: name || 'Bilde', secs: 10 },
      video: { el: { kind: 'video', config: { url, loop: false, mute: true, fit: 'contain' } }, title: name || 'Video', secs: 30 },
      youtube: { el: { kind: 'video', config: { url, loop: false, mute: true, fit: 'contain' } }, title: 'YouTube', secs: 60 },
      web: { el: { kind: 'web', config: { url, refreshMinutes: refresh ?? 15 } }, title: hostOf(url) || 'Nettside', secs: 20 }
    }[kind];
    if (!spec) return;
    // Videofiler: bruk videoens lengde som visningstid.
    const secs = kind === 'video' ? (await videoSeconds(url)) || spec.secs : spec.secs;
    try {
      const s = await api.deck.slide.create({
        playlist_id: Number(playlistId),
        name: spec.title.replace(/\.[a-z0-9]+$/i, ''),
        elements: [{ ...full, ...spec.el }]
      });
      await api.deck.slide.update(s.id, {
        duration_seconds: secs,
        background: { type: 'color', color: '#000000' }
      });
      await reload(s.id);
      onChange?.();
      sendOp({ k: 'deck.reload' });
    } catch (e) {
      setErr(e.message);
    }
  };

  // Dokument -> ett lysbilde pr. side (konverteres på serveren).
  const importDocument = async (file) => {
    setImporting({ name: file.name, phase: 'upload', upload: 0, done: 0, total: 0 });
    try {
      const { job } = await api.imports.start(file, { playlistId, duration: 10 }, (p) =>
        setImporting((st) => st && { ...st, upload: p })
      );
      setImporting((st) => st && { ...st, phase: 'converting' });
      for (;;) {
        await new Promise((r) => setTimeout(r, 1200));
        const st = await api.imports.status(job);
        setImporting((cur) => cur && { ...cur, phase: st.phase, done: st.done, total: st.total });
        if (st.status === 'error') throw new Error(st.error || 'Importen feilet');
        if (st.status === 'done') {
          await reload(st.slide_ids?.[0]);
          onChange?.();
          sendOp({ k: 'deck.reload' });
          setImporting(null);
          return;
        }
      }
    } catch (e) {
      setImporting((st) => ({ ...(st || {}), error: e.message }));
    }
  };

  const addSlideFromTemplate = async (tpl) => {
    try {
      const s = await api.deck.slide.create({ playlist_id: Number(playlistId), template_id: tpl.id });
      await reload(s.id);
      onChange?.();
      sendOp({ k: 'deck.reload' });
    } catch (e) {
      setErr(e.message);
    }
  };
  const dupSlide = async (sid) => {
    try {
      const s = await api.deck.slide.duplicate(sid);
      await reload(s.id);
      onChange?.();
      sendOp({ k: 'deck.reload' });
    } catch (e) {
      setErr(e.message);
    }
  };
  const deleteSlide = async (sid) => {
    if (slides.length <= 1) {
      setErr('En spilleliste må ha minst ett lysbilde.');
      return;
    }
    if (!confirm('Slette lysbildet? Det havner i papirkurven.')) return;
    try {
      await api.deck.slide.remove(sid);
      await reload();
      onChange?.();
      sendOp({ k: 'deck.reload' });
    } catch (e) {
      setErr(e.message);
    }
  };
  const moveSlide = async (from, to) => {
    if (from === to) return;
    const ordered = [...slides];
    const [x] = ordered.splice(from, 1);
    ordered.splice(to, 0, x);
    setSlides(ordered.map((s, i) => ({ ...s, position: i })));
    try {
      await Promise.all(
        ordered
          .map((s, i) => (s.position === i ? null : api.deck.slide.update(s.id, { position: i })))
          .filter(Boolean)
      );
      sendOp({ k: 'deck.reload' });
    } catch (e) {
      setErr(e.message);
    }
  };

  const setOrientation = async (o) => {
    try {
      const pl = await api.playlists.update(playlistId, { orientation: o });
      setPlaylist(pl);
      sendOp({ k: 'deck.reload' });
      onChange?.();
    } catch (e) {
      setErr(e.message);
    }
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || name === playlist?.name) return setNameDraft(playlist?.name || '');
    try {
      setPlaylist(await api.playlists.update(playlistId, { name }));
      onChange?.();
    } catch (e) {
      setErr(e.message);
    }
  };

  const saveTemplate = async (s) => {
    const name = window.prompt('Navn på lysbilde-mal:');
    if (!name) return;
    const payload = {
      name: s.name,
      duration_seconds: s.duration_seconds,
      transition: s.transition,
      transition_ms: s.transition_ms,
      background: s.background,
      elements: (s.elements || []).map((e) => ({
        kind: e.kind,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        z: e.z,
        rotation: e.rotation,
        config: e.config
      }))
    };
    try {
      await api.templates.create({ name: name.trim(), kind: 'slide', payload });
      alert('Lagret som mal.');
    } catch (e) {
      alert(e.message);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-paper">
      {/* topplinje */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-card px-4 py-2.5">
        <Button variant="outline" size="sm" onClick={onBack}>
          <Icon name="back" className="h-4 w-4" />
          Tilbake
        </Button>
        <div className="flex min-w-0 flex-col">
          <label className="sr-only" htmlFor="playlist-name">
            Navn på spillelisten
          </label>
          <input
            id="playlist-name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="min-w-0 rounded-md bg-transparent px-1 text-sm font-bold text-ink hover:bg-hair focus:bg-paper focus:outline-none focus:ring-2 focus:ring-focus/30"
          />
          <span className="truncate px-1 text-[11px] text-muted">
            {playlist?.used_by?.length
              ? `Vises på ${playlist.used_by.map((u) => u.name).join(', ')}`
              : 'Ikke i bruk på noen kanal'}
          </span>
        </div>

        <div className="flex overflow-hidden rounded-lg border border-line">
          {['landscape', 'portrait'].map((o) => (
            <button
              key={o}
              onClick={() => setOrientation(o)}
              className={`px-3 py-1.5 text-xs font-bold ${
                orientation === o ? 'bg-brand text-onbrand' : 'bg-card text-muted hover:bg-hair'
              }`}
            >
              {o === 'landscape' ? '16:9' : '9:16'}
            </button>
          ))}
        </div>

        <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
          <Icon name="plus" className="h-4 w-4" />
          Lysbilde
        </Button>

        <div className="relative">
          <Button size="sm" onClick={() => setWidgetMenu((v) => !v)}>
            <Icon name="plus" className="h-4 w-4" />
            Widget
          </Button>
          {widgetMenu && (
            <div className="absolute left-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-hair bg-card py-1 shadow-pop">
              {ELEMENT_KINDS.map((k) => (
                <button
                  key={k.kind}
                  onClick={() => addElement(k.kind)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-ink hover:bg-hair"
                >
                  <Icon name={ELEMENT_ICON[k.kind] || 'square'} className="h-4 w-4 text-muted" />
                  {k.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <PresenceStack peers={otherPeers} connected={collab.connected} className="ml-auto" />

        <button
          onClick={() => setSnap((v) => !v)}
          title="Snapping til senter/kanter"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            snap ? 'border-brand bg-brand-tint text-brand' : 'border-line bg-card text-muted hover:bg-hair'
          }`}
        >
          <Icon name="layers" className="h-3.5 w-3.5" />
          Snapping
        </button>
        <a
          href={`${origin}/preview/${playlistId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink hover:bg-hair"
        >
          <Icon name="eye" className="h-3.5 w-3.5" />
          Forhåndsvis
        </a>
      </div>

      {importing && <ImportBanner state={importing} onClose={() => setImporting(null)} />}

      {err && (
        <div className="shrink-0 px-4 py-2">
          <ErrorText>{err}</ErrorText>
        </div>
      )}

      {/* arbeidsflate */}
      <div className="flex min-h-0 flex-1">
        <SlideNavigator
          slides={slides}
          orientation={orientation}
          selectedId={selSlide}
          peers={otherPeers}
          onSelect={setSelSlide}
          onAdd={() => setPickerOpen(true)}
          onDuplicate={dupSlide}
          onDelete={deleteSlide}
          onMove={moveSlide}
        />

        <div className="relative min-w-0 flex-1">
          {slide ? (
            <CanvasStage
              slide={slide}
              orientation={orientation}
              selectedId={selEl}
              peers={slidePeers}
              onSelect={setSelEl}
              onChange={patchElement}
              onDeleteElement={deleteElement}
              onCursor={collab.sendCursor}
              snapEnabled={snap}
            />
          ) : (
            <div className="grid h-full place-items-center text-muted">Ingen lysbilder.</div>
          )}
        </div>

        <Inspector
          slide={element ? null : slide}
          element={element}
          categories={categories}
          onElementChange={patchElement}
          onDeleteElement={deleteElement}
          onElementZ={elementZ}
          onSlideChange={patchSlide}
          onDuplicateSlide={dupSlide}
          onDeleteSlide={deleteSlide}
          onSaveTemplate={saveTemplate}
        />
      </div>

      {pickerOpen && (
        <LayoutPicker
          onPick={addSlide}
          onPickTemplate={addSlideFromTemplate}
          onPickMedia={addMediaSlide}
          onImportDocument={importDocument}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
