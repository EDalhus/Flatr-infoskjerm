import { useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api.js';
import { ELEMENT_KINDS, ELEMENT_ICON, defaultElement } from '../../../lib/deck.js';
import { Icon, Button, ErrorText } from '../ui.jsx';
import SlideNavigator from './SlideNavigator.jsx';
import CanvasStage from './CanvasStage.jsx';
import Inspector from './Inspector.jsx';

export default function DeckEditor({ screenId, onBack, onChange }) {
  const [screen, setScreen] = useState(null);
  const [slides, setSlides] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selSlide, setSelSlide] = useState(null);
  const [selEl, setSelEl] = useState(null);
  const [err, setErr] = useState('');
  const [widgetMenu, setWidgetMenu] = useState(false);
  const timers = useRef({});

  const reload = async (keepSlide) => {
    try {
      const [scr, deck, cats] = await Promise.all([
        api.screens.list(),
        api.deck.get(screenId),
        api.categories.list()
      ]);
      setScreen((scr || []).find((s) => String(s.id) === String(screenId)) || null);
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
  }, [screenId]);
  useEffect(() => {
    setSelEl(null);
  }, [selSlide]);

  const slide = slides.find((s) => s.id === selSlide) || null;
  const element = slide?.elements?.find((e) => e.id === selEl) || null;
  const orientation = screen?.orientation === 'portrait' ? 'portrait' : 'landscape';

  const debounce = (key, fn, ms = 350) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, ms);
  };

  const patchSlide = (sid, patch, commit) => {
    setSlides((ss) => ss.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
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
    } catch (e) {
      setErr(e.message);
    }
  };

  const addSlide = async () => {
    try {
      const s = await api.deck.slide.create({ screen_id: Number(screenId) });
      await reload(s.id);
      onChange?.();
    } catch (e) {
      setErr(e.message);
    }
  };
  const dupSlide = async (sid) => {
    try {
      const s = await api.deck.slide.duplicate(sid);
      await reload(s.id);
      onChange?.();
    } catch (e) {
      setErr(e.message);
    }
  };
  const deleteSlide = async (sid) => {
    if (slides.length <= 1) {
      setErr('En skjerm må ha minst ett lysbilde.');
      return;
    }
    if (!confirm('Slette lysbildet? Det havner i papirkurven.')) return;
    try {
      await api.deck.slide.remove(sid);
      await reload();
      onChange?.();
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
    } catch (e) {
      setErr(e.message);
    }
  };

  const setOrientation = async (o) => {
    try {
      await api.screens.update(screenId, { orientation: o });
      setScreen((sc) => ({ ...sc, orientation: o }));
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
        <div className="min-w-0 truncate text-sm font-bold text-ink">
          {screen?.name || 'Skjerm'}
        </div>

        <div className="flex overflow-hidden rounded-lg border border-line">
          {['landscape', 'portrait'].map((o) => (
            <button
              key={o}
              onClick={() => setOrientation(o)}
              className={`px-3 py-1.5 text-xs font-bold ${
                orientation === o ? 'bg-brand text-white' : 'bg-card text-muted hover:bg-hair'
              }`}
            >
              {o === 'landscape' ? '16:9' : '9:16'}
            </button>
          ))}
        </div>

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

        <a
          href={`${origin}/display/${screenId}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink hover:bg-hair"
        >
          <Icon name="eye" className="h-3.5 w-3.5" />
          Forhåndsvis
        </a>
      </div>

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
          onSelect={setSelSlide}
          onAdd={addSlide}
          onDuplicate={dupSlide}
          onDelete={deleteSlide}
          onMove={moveSlide}
        />

        <div className="min-w-0 flex-1 p-4">
          {slide ? (
            <CanvasStage
              slide={slide}
              orientation={orientation}
              selectedId={selEl}
              onSelect={setSelEl}
              onChange={patchElement}
              onDeleteElement={deleteElement}
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
    </div>
  );
}
