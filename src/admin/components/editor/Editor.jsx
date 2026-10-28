// Editoren for én presentasjon – lerret, lysbilder og egenskaper, med
// samarbeid i sanntid (markører, hvem jobber hvor, låser elementer andre
// holder på med), angre/gjør om, kopier/lim inn og hurtigtaster.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/api.js';
import { ELEMENT_KINDS, ELEMENT_ICON, defaultElement } from '../../../lib/deck.js';
import { useCollab } from '../../../hooks/useCollab.js';
import { applyBrandToElements, brandBackground } from '../../../lib/brand.js';
import { getBrand } from '../../brandStore.js';
import { usePreviewCtx } from '../deck/previewCtx.js';
import { Icon, ErrorText } from '../ui.jsx';
import LayoutPicker from '../deck/LayoutPicker.jsx';
import { MediaPicker } from '../MediaPicker.jsx';
import Stage from './Stage.jsx';
import Panel from './Panel.jsx';
import VersionHistory from './VersionHistory.jsx';
import ReviewBar from './ReviewBar.jsx';
import SlideRail from './SlideRail.jsx';
import { bbox, clamp, round } from './geometry.js';
import { hostOf, videoSeconds, ImportBanner } from './media.jsx';

const PRIMARY = ['text', 'image', 'shape', 'video'];
const CLIPBOARD_KEY = 'flatr.editor.clipboard';
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3];
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

const initials = (name = '') =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase() || '?';

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, structuredClone(obj[k])]));
const typingIn = (t) => t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function ToolButton({ icon, label, onClick, active, disabled, shortcut }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-35 ${
        active ? 'bg-brand-tint text-brand' : 'text-ink hover:bg-zone'
      }`}
    >
      <Icon name={icon} className="h-[18px] w-[18px]" />
    </button>
  );
}

export const AI_PROMPT_KEY = 'flatr.aiPrompt';
export const AI_APP_KINDS = ['claude'];

export default function Editor({ playlistId, onBack, onChange, me }) {
  const [playlist, setPlaylist] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [slides, setSlides] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selSlide, setSelSlide] = useState(null);
  const [selection, setSelection] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const readOnly = me?.role === 'viewer';
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commentCounts, setCommentCounts] = useState({});
  // ?comments=1 (lenke fra e-postvarsel) åpner kommentarfanen.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('comments')) setPanelTab('comments');
  }, []);
  // Høyre panel: design | layers | ai. ⌘K sender en melding hit (aiPending).
  const [panelTab, setPanelTab] = useState('design');
  const [aiPending, setAiPending] = useState(null);
  useEffect(() => {
    const take = (p) => {
      if (!p || Number(p.playlist) !== Number(playlistId)) return;
      setPanelTab('ai');
      setAiPending({ id: p.id, text: p.text });
    };
    // Kom vi hit fra ⌘K (ny eller annen presentasjon)?
    try {
      const raw = sessionStorage.getItem(AI_PROMPT_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Number(p.playlist) === Number(playlistId)) {
          sessionStorage.removeItem(AI_PROMPT_KEY);
          take(p);
        }
      }
    } catch {
      /* ignore */
    }
    const onAsk = (e) => take(e.detail);
    window.addEventListener('flatr:ai', onAsk);
    return () => window.removeEventListener('flatr:ai', onAsk);
  }, [playlistId]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Aktiverte Flatr Apps styrer hvilke widgeter som kan legges til.
  const [installedApps, setInstalledApps] = useState([]);
  useEffect(() => {
    api.apps
      .list()
      .then((rows) => setInstalledApps(rows || []))
      .catch(() => setInstalledApps([]));
  }, []);
  const [mediaFor, setMediaFor] = useState(null); // 'image' | 'video' når vi setter inn fra biblioteket
  const [importing, setImporting] = useState(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  // slidesRef oppdateres synkront ved hver endring (updateSlides), så lagring
  // og angre alltid leser siste verdier – også før React har tegnet på nytt.
  const slidesRef = useRef(slides);
  const updateSlides = (fn) => {
    const next = typeof fn === 'function' ? fn(slidesRef.current) : fn;
    slidesRef.current = next;
    setSlides(next);
  };
  const history = useRef({ undo: [], redo: [] });
  const idMap = useRef(new Map()); // gammel id -> ny id (når angre gjenskaper slettede elementer)
  const pending = useRef(new Map()); // id -> verdier før endringen (til angre)
  const flushTimer = useRef(null);
  const opTimers = useRef({});
  const slideTimers = useRef({});
  const ctx = usePreviewCtx();

  const say = (msg) => {
    setToast(msg);
    clearTimeout(say.t);
    say.t = setTimeout(() => setToast(''), 2600);
  };

  /* ---------------------------------- last ---------------------------------- */

  const reload = useCallback(
    async (keepSlide) => {
      try {
        const [pl, deck, cats] = await Promise.all([
          api.playlists.get(playlistId),
          api.deck.get(playlistId),
          api.categories.list()
        ]);
        setPlaylist(pl || null);
        setNameDraft(pl?.name || '');
        updateSlides(deck || []);
        setCategories(cats || []);
        setSelSlide((prev) => {
          const want = keepSlide ?? prev;
          return want && (deck || []).some((s) => s.id === want) ? want : (deck?.[0]?.id ?? null);
        });
      } catch (e) {
        setErr(e.message);
      }
    },
    [playlistId]
  );

  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => setSelection([]), [selSlide]);

  const slide = slides.find((s) => s.id === selSlide) || null;
  const orientation = playlist?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const selected = (slide?.elements || []).filter((e) => selection.includes(e.id));
  const findEl = (id) => {
    for (const s of slidesRef.current) {
      const el = s.elements.find((e) => e.id === id);
      if (el) return { el, slide: s };
    }
    return null;
  };
  const rid = (id) => {
    let cur = id;
    while (idMap.current.has(cur)) cur = idMap.current.get(cur);
    return cur;
  };

  /* -------------------------------- samarbeid -------------------------------- */

  const onRemoteOp = useCallback(
    (op) => {
      if (!op) return;
      if (op.k === 'el.patch') {
        updateSlides((ss) => ss.map((s) => ({ ...s, elements: s.elements.map((e) => (e.id === op.id ? { ...e, ...op.patch } : e)) })));
      } else if (op.k === 'el.add' && op.el) {
        updateSlides((ss) =>
          ss.map((s) =>
            s.id === op.slideId && !s.elements.some((e) => e.id === op.el.id) ? { ...s, elements: [...s.elements, op.el] } : s
          )
        );
      } else if (op.k === 'el.remove') {
        updateSlides((ss) => ss.map((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== op.id) })));
        setSelection((sel) => sel.filter((id) => id !== op.id));
      } else if (op.k === 'slide.patch') {
        updateSlides((ss) => ss.map((s) => (s.id === op.id ? { ...s, ...op.patch } : s)));
      } else {
        clearTimeout(onRemoteOp.t);
        onRemoteOp.t = setTimeout(() => reload(), 250);
      }
    },
    [reload]
  );

  const collab = useCollab(`pl-${playlistId}`, { onOp: onRemoteOp });
  const sendOp = collab.sendOp;
  useEffect(() => collab.setFocus(selSlide), [selSlide, collab.setFocus]);
  useEffect(() => collab.setSelect(selection[0] ?? null), [selection, collab.setSelect]);

  const peers = useMemo(() => collab.peers.filter((p) => p.id && p.id !== collab.selfId), [collab.peers, collab.selfId]);
  // Elementer andre har markert er låst for meg.
  const locks = useMemo(() => {
    const m = new Map();
    for (const p of peers) if (p.el != null && !m.has(p.el)) m.set(p.el, p);
    return m;
  }, [peers]);
  useEffect(() => {
    if (selection.some((id) => locks.has(id))) setSelection((sel) => sel.filter((id) => !locks.has(id)));
  }, [locks]);

  /* --------------------------- endringer + angre ---------------------------- */

  const applyLocal = (patches) =>
    updateSlides((ss) =>
      ss.map((s) => ({
        ...s,
        elements: s.elements.map((e) => {
          const p = patches.find((x) => x.id === e.id);
          return p ? { ...e, ...p.patch } : e;
        })
      }))
    );

  const broadcast = (patches) => {
    for (const { id, patch } of patches) {
      clearTimeout(opTimers.current[id]);
      opTimers.current[id] = setTimeout(() => sendOp({ k: 'el.patch', id, patch }), 30);
    }
  };

  const pushHistory = (entry) => {
    history.current.undo.push(entry);
    if (history.current.undo.length > 100) history.current.undo.shift();
    history.current.redo = [];
    setHistoryVersion((v) => v + 1);
  };

  /** Lagrer ventende endringer og legger dem i angre-historikken. */
  const flush = () => {
    clearTimeout(flushTimer.current);
    if (!pending.current.size) return;
    const items = [];
    for (const [id, before] of pending.current) {
      const found = findEl(id);
      if (!found) continue;
      const after = pick(found.el, Object.keys(before));
      items.push({ id, before, after });
      api.deck.element.update(id, after).catch((e) => setErr(e.message));
      sendOp({ k: 'el.patch', id, patch: after });
    }
    pending.current.clear();
    if (items.length) pushHistory({ type: 'patch', items });
    onChange?.();
  };

  /**
   * Endrer elementer. commit: 'now' (slipp av dra, knapper), 'later' (felt i
   * panelet – samles i 600 ms) eller false (underveis i et dra).
   */
  const change = (patches, commit) => {
    for (const { id, patch } of patches) {
      if (!pending.current.has(id)) {
        const found = findEl(id);
        if (found) pending.current.set(id, pick(found.el, Object.keys(patch)));
      } else {
        const before = pending.current.get(id);
        const found = findEl(id);
        for (const k of Object.keys(patch)) if (!(k in before) && found) before[k] = structuredClone(found.el[k]);
      }
    }
    applyLocal(patches);
    broadcast(patches);
    if (commit === 'now') setTimeout(flush, 0);
    else if (commit === 'later') {
      clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(flush, 600);
    }
  };

  const createElements = async (slideId, specs) => {
    const created = [];
    for (const spec of specs) {
      const { id: _old, slide_id: _s, created_at: _c, ...rest } = spec;
      const el = await api.deck.element.create({ ...rest, slide_id: slideId });
      created.push(el);
      sendOp({ k: 'el.add', slideId, el });
    }
    updateSlides((ss) => ss.map((s) => (s.id === slideId ? { ...s, elements: [...s.elements, ...created] } : s)));
    return created;
  };

  const removeElements = async (ids) => {
    for (const id of ids) {
      await api.deck.element.remove(id).catch(() => {});
      sendOp({ k: 'el.remove', id });
    }
    updateSlides((ss) => ss.map((s) => ({ ...s, elements: s.elements.filter((e) => !ids.includes(e.id)) })));
    setSelection((sel) => sel.filter((id) => !ids.includes(id)));
  };

  const runEntry = async (entry, direction) => {
    if (entry.type === 'patch') {
      const patches = entry.items.map((it) => ({ id: rid(it.id), patch: direction === 'undo' ? it.before : it.after }));
      applyLocal(patches);
      for (const p of patches) {
        api.deck.element.update(p.id, p.patch).catch(() => {});
        sendOp({ k: 'el.patch', id: p.id, patch: p.patch });
      }
    } else {
      const add = (entry.type === 'add') === (direction === 'redo');
      if (add) {
        const created = await createElements(entry.slideId, entry.els);
        entry.els.forEach((old, i) => created[i] && idMap.current.set(old.id, created[i].id));
        setSelection(created.map((e) => e.id));
      } else {
        await removeElements(entry.els.map((e) => rid(e.id)));
      }
    }
    onChange?.();
  };

  const undo = async () => {
    flush();
    const entry = history.current.undo.pop();
    if (!entry) return;
    await runEntry(entry, 'undo');
    history.current.redo.push(entry);
    setHistoryVersion((v) => v + 1);
  };
  const redo = async () => {
    const entry = history.current.redo.pop();
    if (!entry) return;
    await runEntry(entry, 'redo');
    history.current.undo.push(entry);
    setHistoryVersion((v) => v + 1);
  };

  /* ------------------------------ elementer ------------------------------- */

  const maxZ = () => (slide?.elements || []).reduce((m, e) => Math.max(m, e.z), -1);

  const insert = async (kind, configPatch = {}, box = null) => {
    setMoreOpen(false);
    if (!slide) return;
    const d = defaultElement(kind, maxZ() + 1);
    const [branded] = applyBrandToElements([{ ...d, config: { ...d.config, ...configPatch } }], getBrand());
    const el = { ...branded, x: round(50 - d.w / 2), y: round(50 - d.h / 2), ...box };
    try {
      const [created] = await createElements(slide.id, [el]);
      pushHistory({ type: 'add', slideId: slide.id, els: [created] });
      setSelection([created.id]);
      onChange?.();
    } catch (e) {
      setErr(e.message);
    }
  };

  const insertFromLibrary = (kind) => setMediaFor(kind);

  const deleteSelected = async () => {
    const els = selected.filter((e) => !locks.has(e.id));
    if (!els.length || !slide) return;
    flush();
    await removeElements(els.map((e) => e.id));
    pushHistory({ type: 'remove', slideId: slide.id, els: els.map((e) => structuredClone(e)) });
    onChange?.();
  };

  const copy = () => {
    if (!selected.length) return;
    const data = selected.map((e) => structuredClone(e));
    try {
      localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
    copy.data = data;
    say(`Kopierte ${data.length} ${data.length === 1 ? 'element' : 'elementer'}`);
  };

  const paste = async (source) => {
    if (!slide) return;
    let data = source;
    if (!data) {
      try {
        data = JSON.parse(localStorage.getItem(CLIPBOARD_KEY) || 'null');
      } catch {
        data = copy.data;
      }
    }
    if (!data?.length) return;
    let z = maxZ();
    const specs = data.map((e) => ({
      ...e,
      x: clamp(e.x + 2, 0, 100 - Math.min(e.w, 100)),
      y: clamp(e.y + 2, 0, 100 - Math.min(e.h, 100)),
      z: ++z
    }));
    const created = await createElements(slide.id, specs);
    pushHistory({ type: 'add', slideId: slide.id, els: created });
    setSelection(created.map((e) => e.id));
    onChange?.();
  };

  const duplicate = () => paste(selected.map((e) => structuredClone(e)));

  const layer = (dir) => {
    if (selected.length !== 1 || !slide) return;
    const el = selected[0];
    const sorted = [...slide.elements].sort((a, b) => a.z - b.z || a.id - b.id);
    const i = sorted.findIndex((e) => e.id === el.id);
    if (dir === 'front') return change([{ id: el.id, patch: { z: sorted.at(-1).z + 1 } }], 'now');
    if (dir === 'back') return change([{ id: el.id, patch: { z: sorted[0].z - 1 } }], 'now');
    const j = dir === 'forward' ? i + 1 : i - 1;
    if (j < 0 || j >= sorted.length) return;
    const other = sorted[j];
    const za = other.z === el.z ? el.z + (dir === 'forward' ? 1 : -1) : other.z;
    change(
      [
        { id: el.id, patch: { z: za } },
        { id: other.id, patch: { z: el.z } }
      ],
      'now'
    );
  };

  const align = (where, mode) => {
    const els = selected.filter((e) => !locks.has(e.id));
    if (!els.length) return;
    const box = mode === 'selection' && els.length > 1 ? bbox(els) : { x: 0, y: 0, w: 100, h: 100 };
    const patches = els.map((e) => {
      const p = {};
      if (where === 'left') p.x = box.x;
      if (where === 'hcenter') p.x = box.x + box.w / 2 - e.w / 2;
      if (where === 'right') p.x = box.x + box.w - e.w;
      if (where === 'top') p.y = box.y;
      if (where === 'vcenter') p.y = box.y + box.h / 2 - e.h / 2;
      if (where === 'bottom') p.y = box.y + box.h - e.h;
      return { id: e.id, patch: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, round(v)])) };
    });
    change(patches, 'now');
  };

  // Grupper: medlemmene deler config.group (og config.groupName for laglisten).
  const group = () => {
    const els = selected.filter((e) => !locks.has(e.id));
    if (els.length < 2) return;
    const existing = new Set((slide?.elements || []).map((e) => e.config?.group).filter(Boolean));
    const id = `g${Date.now().toString(36)}`;
    const groupName = `Gruppe ${existing.size + 1}`;
    change(els.map((e) => ({ id: e.id, patch: { config: { ...e.config, group: id, groupName } } })), 'now');
    say(`${groupName} er laget`);
  };

  const ungroup = () => {
    const els = selected.filter((e) => !locks.has(e.id) && e.config?.group);
    if (!els.length) return;
    change(
      els.map((e) => {
        const { group: _g, groupName: _n, ...config } = e.config;
        return { id: e.id, patch: { config } };
      }),
      'now'
    );
    say('Gruppen er løst opp');
  };

  const nudge = (dx, dy) => {
    const els = selected.filter((e) => !locks.has(e.id));
    if (!els.length) return;
    change(
      els.map((e) => ({ id: e.id, patch: { x: round(e.x + dx), y: round(e.y + dy) } })),
      'later'
    );
  };

  /* ------------------------------- lysbilder -------------------------------- */

  const patchSlide = (sid, patch, commit) => {
    updateSlides((ss) => ss.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
    sendOp({ k: 'slide.patch', id: sid, patch });
    if (commit) {
      clearTimeout(slideTimers.current[sid]);
      slideTimers.current[sid] = setTimeout(
        () =>
          api.deck.slide
            .update(sid, patch)
            .then(() => onChange?.())
            .catch((e) => setErr(e.message)),
        350
      );
    }
  };

  const afterStructural = async (focusId) => {
    await reload(focusId);
    onChange?.();
    sendOp({ k: 'deck.reload' });
  };

  const addSlide = async (layout) => {
    try {
      // Merkevaren: skrift og tekstfarge på tekstene, og bakgrunnsfargen.
      const brand = getBrand();
      const s = await api.deck.slide.create({
        playlist_id: Number(playlistId),
        name: layout?.label,
        elements: applyBrandToElements(layout?.elements || [], brand),
        background: brandBackground(brand) || undefined
      });
      await afterStructural(s.id);
    } catch (e) {
      setErr(e.message);
    }
  };
  const addSlideFromTemplate = async (tpl) => {
    try {
      const s = await api.deck.slide.create({ playlist_id: Number(playlistId), template_id: tpl.id });
      await afterStructural(s.id);
    } catch (e) {
      setErr(e.message);
    }
  };
  const dupSlide = async (sid) => {
    try {
      const s = await api.deck.slide.duplicate(sid);
      await afterStructural(s.id);
    } catch (e) {
      setErr(e.message);
    }
  };
  const deleteSlide = async (sid) => {
    if (slides.length <= 1) return setErr('En presentasjon må ha minst ett lysbilde.');
    if (!confirm('Slette lysbildet? Det havner i «Nylig slettet».')) return;
    try {
      await api.deck.slide.remove(sid);
      await afterStructural();
    } catch (e) {
      setErr(e.message);
    }
  };
  const moveSlide = async (from, to) => {
    if (from === to) return;
    const ordered = [...slides];
    const [x] = ordered.splice(from, 1);
    ordered.splice(to, 0, x);
    updateSlides(ordered.map((s, i) => ({ ...s, position: i })));
    try {
      await Promise.all(ordered.map((s, i) => (s.position === i ? null : api.deck.slide.update(s.id, { position: i }))).filter(Boolean));
      sendOp({ k: 'deck.reload' });
    } catch (e) {
      setErr(e.message);
    }
  };

  const addMediaSlide = async ({ kind, url, name, refresh }) => {
    const full = { x: 0, y: 0, w: 100, h: 100, z: 0, rotation: 0 };
    const spec = {
      image: { el: { kind: 'image', config: { url, fit: 'contain', radius: 0 } }, title: name || 'Bilde', secs: 10 },
      video: { el: { kind: 'video', config: { url, loop: false, mute: true, fit: 'contain' } }, title: name || 'Video', secs: 30 },
      youtube: { el: { kind: 'video', config: { url, loop: false, mute: true, fit: 'contain' } }, title: 'YouTube', secs: 60 },
      web: { el: { kind: 'web', config: { url, refreshMinutes: refresh ?? 15 } }, title: hostOf(url) || 'Nettside', secs: 20 }
    }[kind];
    if (!spec) return;
    const secs = kind === 'video' ? (await videoSeconds(url)) || spec.secs : spec.secs;
    try {
      const s = await api.deck.slide.create({
        playlist_id: Number(playlistId),
        name: spec.title.replace(/\.[a-z0-9]+$/i, ''),
        elements: [{ ...full, ...spec.el }]
      });
      await api.deck.slide.update(s.id, { duration_seconds: secs, background: { type: 'color', color: '#000000' } });
      await afterStructural(s.id);
    } catch (e) {
      setErr(e.message);
    }
  };

  const importDocument = async (file) => {
    setImporting({ name: file.name, phase: 'upload', upload: 0, done: 0, total: 0 });
    try {
      const { job } = await api.imports.start(file, { playlistId, duration: 10 }, (p) => setImporting((st) => st && { ...st, upload: p }));
      setImporting((st) => st && { ...st, phase: 'converting' });
      for (;;) {
        await new Promise((r) => setTimeout(r, 1200));
        const st = await api.imports.status(job);
        setImporting((cur) => cur && { ...cur, phase: st.phase, done: st.done, total: st.total });
        if (st.status === 'error') throw new Error(st.error || 'Importen feilet');
        if (st.status === 'done') {
          await afterStructural(st.slide_ids?.[0]);
          setImporting(null);
          return;
        }
      }
    } catch (e) {
      setImporting((st) => ({ ...(st || {}), error: e.message }));
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
      elements: (s.elements || []).map((e) => pick(e, ['kind', 'x', 'y', 'w', 'h', 'z', 'rotation', 'config']))
    };
    try {
      await api.templates.create({ name: name.trim(), kind: 'slide', payload });
      say('Lagret som mal.');
    } catch (e) {
      setErr(e.message);
    }
  };

  const setOrientation = async (o) => {
    try {
      setPlaylist(await api.playlists.update(playlistId, { orientation: o }));
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

  /* -------------------------------- tastatur -------------------------------- */

  const keys = useRef({});
  keys.current = { undo, redo, copy, paste, duplicate, deleteSelected, nudge, group, ungroup, slide, selection };
  useEffect(() => {
    const onKey = (e) => {
      if (typingIn(e.target) || pickerOpen || mediaFor) return;
      const k = keys.current;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        return e.shiftKey ? k.redo() : k.undo();
      }
      if (mod && key === 'y') return e.preventDefault(), k.redo();
      if (mod && key === 'c') return k.copy();
      if (mod && key === 'v') return e.preventDefault(), k.paste();
      if (mod && key === 'd') return e.preventDefault(), k.duplicate();
      if (mod && key === 'g') return e.preventDefault(), e.shiftKey ? k.ungroup() : k.group();
      if (mod && key === 'a') {
        e.preventDefault();
        return setSelection((k.slide?.elements || []).filter((x) => !locks.has(x.id)).map((x) => x.id));
      }
      if (e.key === 'Escape') return setSelection([]);
      if ((e.key === 'Delete' || e.key === 'Backspace') && k.selection.length) return e.preventDefault(), k.deleteSelected();
      const step = e.shiftKey ? 5 : 0.5;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (mv && k.selection.length) {
        e.preventDefault();
        k.nudge(...mv);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerOpen, mediaFor, locks]);

  // Lagre ventende endringer når editoren lukkes.
  useEffect(() => () => flush(), []);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const canUndo = history.current.undo.length > 0;
  const canRedo = history.current.redo.length > 0;
  void historyVersion;
  // Vær/nyheter/kalender er apper i markedsplassen – vises bare når de er aktivert.
  // Apper med data (AIS, egne) blir hver sin «Flatr App»-knapp.
  const appGated = new Set(['weather', 'rss', 'calendar', 'app']);
  const activeKinds = new Set(installedApps.map((a) => a.kind));
  const others = ELEMENT_KINDS.filter((k) => !PRIMARY.includes(k.kind) && (!appGated.has(k.kind) || (k.kind !== 'app' && activeKinds.has(k.kind))));
  const dataApps = installedApps.filter((a) => ['ais', 'custom', 'birthdays'].includes(a.kind));
  // AI-fanen finnes når en assistent-app (Claude AI) er aktivert.
  const aiEnabled = installedApps.some((a) => AI_APP_KINDS.includes(a.kind)) || panelTab === 'ai';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-paper">
      {/* ------------------------------- toppfelt ------------------------------- */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-card px-3 py-2">
        <ToolButton icon="back" label="Tilbake til presentasjoner" onClick={() => (flush(), onBack())} />
        <div className="flex min-w-0 flex-col pr-2">
          <label className="sr-only" htmlFor="playlist-name">
            Navn på presentasjonen
          </label>
          <input
            id="playlist-name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-56 min-w-0 rounded-md bg-transparent px-1 text-sm font-bold text-ink hover:bg-zone focus:bg-paper focus:outline-none focus:ring-2 focus:ring-focus/30"
          />
          <span className="truncate px-1 text-[11px] text-muted">
            {playlist?.used_by?.length ? `Vises på ${playlist.used_by.map((u) => u.name).join(', ')}` : 'Ikke i bruk på noen skjerm'}
          </span>
        </div>

        <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />

        {/* sett inn */}
        <div className="flex items-center gap-0.5" role="toolbar" aria-label="Sett inn">
          <ToolButton icon="text" label="Tekst" onClick={() => insert('text')} />
          <ToolButton icon="image" label="Bilde fra biblioteket" onClick={() => insertFromLibrary('image')} />
          <ToolButton icon="square" label="Figur" onClick={() => insert('shape')} />
          <ToolButton icon="play" label="Video fra biblioteket" onClick={() => insertFromLibrary('video')} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-ink hover:bg-zone"
            >
              Widgeter
              <Icon name="down" className="h-4 w-4" />
            </button>
            {moreOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 grid w-72 grid-cols-2 gap-1 rounded-2xl border border-line bg-card p-2 shadow-pop">
                {others.map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    onClick={() => insert(k.kind)}
                    className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-ink hover:bg-zone"
                  >
                    <Icon name={ELEMENT_ICON[k.kind] || 'square'} className="h-4 w-4 text-muted" />
                    {k.label}
                  </button>
                ))}
                {dataApps.map((a) => (
                  <button
                    key={`app-${a.id}`}
                    type="button"
                    onClick={() => insert('app', a.kind === 'birthdays' ? { appId: a.id, days: 7 } : { appId: a.id })}
                    className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-ink hover:bg-zone"
                  >
                    <Icon name={a.definition?.icon || { ais: 'pin', birthdays: 'users' }[a.kind] || 'sparkle'} className="h-4 w-4 text-muted" />
                    <span className="truncate">{a.name}</span>
                  </button>
                ))}
                {dataApps
                  .filter((a) => a.kind === 'birthdays')
                  .map((a) => (
                    <button
                      key={`rain-${a.id}`}
                      type="button"
                      // Fremst og over hele lysbildet; kan gjøres mindre etterpå.
                      onClick={() => insert('app', { appId: a.id, effect: 'rain', amount: 'normal' }, { x: 0, y: 0, w: 100, h: 100 })}
                      className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-ink hover:bg-zone"
                    >
                      <span className="w-4 text-center text-sm" aria-hidden="true">🎂</span>
                      <span className="truncate">Kakeregn</span>
                    </button>
                  ))}
                <a
                  href="/admin?view=apps"
                  className="col-span-2 mt-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line px-2.5 py-2 text-sm font-semibold text-brand hover:bg-brand-tint"
                >
                  <Icon name="sparkle" className="h-4 w-4" />
                  Finn flere i Flatr Apps
                </a>
              </div>
            )}
          </div>
        </div>

        <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
        <ToolButton icon="back" label="Angre" shortcut={`${MOD}Z`} onClick={undo} disabled={!canUndo} />
        <ToolButton icon="chevron" label="Gjør om" shortcut={`${isMac ? '⇧⌘' : 'Ctrl+'}${isMac ? 'Z' : 'Y'}`} onClick={redo} disabled={!canRedo} />

        <div className="ml-auto flex items-center gap-2">
          {/* hvem er her */}
          <div className="flex items-center -space-x-1.5" aria-label="Hvem jobber i presentasjonen">
            {me && (
              <span
                title={`${me.name} (deg)`}
                className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-card"
                style={{ background: me.color }}
              >
                {initials(me.name)}
              </span>
            )}
            {peers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => p.slide && setSelSlide(p.slide)}
                title={`${p.name} – klikk for å gå til lysbildet`}
                className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-card transition-transform hover:z-10 hover:scale-110"
                style={{ background: p.color }}
              >
                {initials(p.name)}
              </button>
            ))}
          </div>
          <span
            className={`h-2 w-2 rounded-full ${collab.connected ? 'bg-ok' : 'bg-warn'}`}
            title={collab.connected ? 'Live – endringer synkroniseres' : 'Kobler til …'}
          />

          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          <div className="flex overflow-hidden rounded-lg border border-line">
            {['landscape', 'portrait'].map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOrientation(o)}
                aria-pressed={orientation === o}
                className={`px-2.5 py-1.5 text-xs font-semibold ${orientation === o ? 'bg-ink text-paper' : 'bg-card text-muted hover:bg-zone'}`}
              >
                {o === 'landscape' ? '16:9' : '9:16'}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-lg border border-line">
            <button type="button" onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)] ?? 0.5)} className="h-8 w-8 text-ink hover:bg-zone" aria-label="Zoom ut">
              −
            </button>
            <button type="button" onClick={() => setZoom(1)} className="h-8 min-w-[3.5rem] text-xs font-semibold tabular-nums text-ink hover:bg-zone" title="Tilpass til vinduet">
              {zoom === 1 ? 'Tilpass' : `${Math.round(zoom * 100)} %`}
            </button>
            <button type="button" onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)] ?? 1.5)} className="h-8 w-8 text-ink hover:bg-zone" aria-label="Zoom inn">
              +
            </button>
          </div>
          <ToolButton icon="layers" label={snap ? 'Snapping på' : 'Snapping av'} active={snap} onClick={() => setSnap((v) => !v)} />
          <ToolButton icon="clock" label="Versjonshistorikk" onClick={() => (flush(), setHistoryOpen(true))} />
          {aiEnabled && (
          <button
            type="button"
            onClick={() => setPanelTab((t) => (t === 'ai' ? 'design' : 'ai'))}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${panelTab === 'ai' ? 'bg-brand-tint text-brand' : 'text-ink hover:bg-zone'}`}
            title={`AI-assistent (${MOD}K)`}
          >
            <Icon name="sparkle" className="h-4 w-4" />
            AI
          </button>
          )}
          <a
            href={`${origin}/preview/${playlistId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-onbrand hover:bg-brand-dark"
          >
            <Icon name="eye" className="h-4 w-4" />
            Forhåndsvis
          </a>
        </div>
      </header>

      {importing && <ImportBanner state={importing} onClose={() => setImporting(null)} />}
      {err && (
        <div className="flex shrink-0 items-center gap-2 px-4 py-2">
          <div className="flex-1">
            <ErrorText>{err}</ErrorText>
          </div>
          <button type="button" onClick={() => setErr('')} className="text-sm font-semibold text-muted hover:text-ink">
            Lukk
          </button>
        </div>
      )}

      <ReviewBar playlistId={playlistId} version={slides} readOnly={readOnly} onPublished={() => say('Publisert til skjermene')} />

      {/* ------------------------------ arbeidsflate ------------------------------ */}
      <div className="flex min-h-0 flex-1">
        <SlideRail
          slides={slides}
          orientation={orientation}
          selectedId={selSlide}
          peers={peers}
          onSelect={setSelSlide}
          onAdd={() => setPickerOpen(true)}
          onDuplicate={dupSlide}
          onDelete={deleteSlide}
          onMove={moveSlide}
          playlistId={playlistId}
          commentCounts={commentCounts}
          onAi={
            aiEnabled
              ? (s, kind) => {
                  const ref = `lysbilde ${slides.findIndex((x) => x.id === s.id) + 1}${s.name ? ` «${s.name}»` : ''} (id ${s.id})`;
                  const text = {
                    better: `Forbedre designet på ${ref}. Behold innholdet og budskapet, men gjør komposisjonen, hierarkiet og typografien bedre. Se på det før og etter.`,
                    variants: `Lag 3 varianter av ${ref} som nye lysbilder rett etter det, med ulik komposisjon og stil men samme innhold. Gi dem navn som «Variant A/B/C». Ikke endre originalen.`,
                    shorter: `Gjør teksten på ${ref} kortere og tydeligere, lesbar på avstand på et par sekunder. Behold designet.`
                  }[kind];
                  setPanelTab('ai');
                  setAiPending({ id: Date.now(), text });
                }
              : undefined
          }
          onCopyTo={async (sid, target) => {
            try {
              await api.deck.slide.copyTo(sid, target.id);
              say(`Kopiert til «${target.name}»`);
            } catch (e) {
              setErr(e.message);
            }
          }}
        />

        <main className={`relative min-w-0 flex-1 ${readOnly ? '[&>*:first-child]:pointer-events-none' : ''}`}>
          {readOnly && (
            <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-card px-4 py-1.5 text-xs font-semibold text-muted shadow-card">
              Du har lesetilgang – du kan se, men ikke endre
            </div>
          )}
          {slide ? (
            <Stage
              slide={slide}
              orientation={orientation}
              zoom={zoom}
              ctx={ctx}
              selection={selection}
              peers={peers}
              locks={locks}
              me={me}
              snap={snap}
              onSelect={setSelection}
              onLive={(patches) => change(patches, false)}
              onCommit={(patches) => change(patches, 'now')}
              onCursor={collab.sendCursor}
              onTextLive={(id, text) => {
                const found = findEl(id);
                if (found) change([{ id, patch: { config: { ...found.el.config, text } } }], false);
              }}
              onTextCommit={() => flush()}
              onLockedClick={(p) => say(`${p.name} jobber med dette elementet akkurat nå`)}
            />
          ) : (
            <div className="grid h-full place-items-center text-muted">Ingen lysbilder.</div>
          )}

          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-card/90 px-3 py-1 text-[11px] text-muted shadow-card">
            Dobbeltklikk tekst for å skrive · Shift-klikk for flere · {MOD}G grupper · Alt-klikk velger én i en gruppe · {MOD}Z angre
          </div>
          {toast && (
            <div role="status" className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper shadow-pop">
              {toast}
            </div>
          )}
        </main>

        <div className={readOnly && panelTab !== 'comments' ? 'pointer-events-none opacity-60' : 'contents'}>
        <Panel
          slide={slide}
          selected={selected}
          selection={selection}
          orientation={orientation}
          categories={categories}
          locks={locks}
          onSelect={setSelection}
          onPatch={(patches) => change(patches, 'later')}
          onLayer={layer}
          onGroup={group}
          onAlign={align}
          onDuplicate={duplicate}
          onDelete={deleteSelected}
          onSlidePatch={patchSlide}
          onDuplicateSlide={dupSlide}
          onDeleteSlide={deleteSlide}
          onSaveTemplate={saveTemplate}
          tab={panelTab}
          slides={slides}
          onSelectSlide={setSelSlide}
          onCommentCount={setCommentCounts}
          openComments={Object.values(commentCounts).reduce((a, b) => a + b, 0)}
          aiEnabled={aiEnabled}
          onTab={setPanelTab}
          playlistId={playlistId}
          aiPending={aiPending}
          onAiPendingUsed={() => setAiPending(null)}
          onAiChanged={() => {
            reload();
            sendOp({ k: 'deck.reload' });
            onChange?.();
          }}
        />
        </div>
      </div>

      {historyOpen && (
        <VersionHistory
          playlistId={playlistId}
          orientation={orientation}
          readOnly={readOnly}
          onClose={() => setHistoryOpen(false)}
          onRestored={() => {
            reload();
            sendOp({ k: 'deck.reload' });
            onChange?.();
            say('Versjonen er gjenopprettet');
          }}
        />
      )}
      {pickerOpen && (
        <LayoutPicker
          onPick={addSlide}
          onPickTemplate={addSlideFromTemplate}
          onPickMedia={addMediaSlide}
          onImportDocument={importDocument}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {mediaFor && (
        <MediaPicker
          kind={mediaFor}
          onClose={() => setMediaFor(null)}
          onPick={(url) => {
            const kind = mediaFor;
            setMediaFor(null);
            insert(kind, kind === 'image' ? { url } : { url });
          }}
        />
      )}
    </div>
  );
}
