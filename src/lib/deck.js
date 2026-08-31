// Widget-typer, standardoppsett, bakgrunner og overganger for canvas-modellen.

export const ELEMENT_KINDS = [
  { kind: 'text', label: 'Tekst', icon: 'text' },
  { kind: 'image', label: 'Bilde', icon: 'image' },
  { kind: 'shape', label: 'Figur', icon: 'square' },
  { kind: 'clock', label: 'Klokke', icon: 'clock' },
  { kind: 'countdown', label: 'Nedtelling', icon: 'clock' },
  { kind: 'program', label: 'Program', icon: 'calendar' },
  { kind: 'qr', label: 'QR-kode', icon: 'tag' },
  { kind: 'video', label: 'Video', icon: 'play' },
  { kind: 'web', label: 'Nettside', icon: 'external' },
  { kind: 'sponsors', label: 'Sponsorer', icon: 'image' }
];
export const ELEMENT_LABEL = Object.fromEntries(ELEMENT_KINDS.map((k) => [k.kind, k.label]));
export const ELEMENT_ICON = Object.fromEntries(ELEMENT_KINDS.map((k) => [k.kind, k.icon]));

export const DEFAULT_ELEMENT_CONFIG = {
  text: {
    text: 'Tekst',
    size: 64,
    weight: 700,
    align: 'left',
    valign: 'top',
    color: '#ffffff',
    lineHeight: 1.1,
    italic: false
  },
  image: { url: '', fit: 'contain', radius: 0 },
  shape: { shape: 'rect', fill: '#1f5566', radius: 16, opacity: 100 },
  clock: { showDate: true, showSeconds: true, frame: false },
  countdown: { mode: 'nextItem', target: '', title: '', doneText: 'Nå kjører vi!', emphasis: 'info' },
  program: { mode: 'agenda', categoryIds: [], max: 8, stage: '', showCategory: true, frame: false },
  qr: { mode: 'schedule', url: '', label: '', caption: '', frame: false },
  video: { url: '', loop: false, mute: true, fit: 'contain' },
  web: { url: '', refreshMinutes: 0 },
  sponsors: {}
};

const SIZE = {
  text: { w: 60, h: 14 },
  image: { w: 30, h: 30 },
  shape: { w: 30, h: 20 },
  clock: { w: 26, h: 16 },
  countdown: { w: 40, h: 24 },
  program: { w: 55, h: 70 },
  qr: { w: 22, h: 34 },
  video: { w: 50, h: 30 },
  web: { w: 50, h: 40 },
  sponsors: { w: 30, h: 24 }
};

export function defaultElement(kind, z = 0) {
  const s = SIZE[kind] || { w: 40, h: 25 };
  return {
    kind,
    x: 12,
    y: 12,
    w: s.w,
    h: s.h,
    z,
    rotation: 0,
    config: structuredClone(DEFAULT_ELEMENT_CONFIG[kind] || {})
  };
}

export const BACKGROUND_PRESETS = [
  { type: 'color', color: '#0f2733' },
  { type: 'color', color: '#020617' },
  { type: 'color', color: '#111827' },
  { type: 'color', color: '#ffffff' },
  { type: 'gradient', from: '#1f5566', to: '#0f2733', angle: 135 },
  { type: 'gradient', from: '#0ea5e9', to: '#1e3a8a', angle: 135 },
  { type: 'gradient', from: '#7c3aed', to: '#ec4899', angle: 135 },
  { type: 'gradient', from: '#f59e0b', to: '#b91c1c', angle: 135 }
];

export function backgroundStyle(bg) {
  const b = bg && typeof bg === 'object' ? bg : { type: 'color', color: '#0f2733' };
  if (b.type === 'gradient') {
    return {
      backgroundImage: `linear-gradient(${b.angle ?? 135}deg, ${b.from || '#1f5566'}, ${b.to || '#0f2733'})`
    };
  }
  if (b.type === 'image' && b.url) {
    return {
      backgroundImage: `url("${b.url}")`,
      backgroundSize: b.fit === 'contain' ? 'contain' : 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundColor: b.color || '#0f2733'
    };
  }
  return { backgroundColor: b.color || '#0f2733' };
}

export const TRANSITIONS = [
  { value: 'none', label: 'Ingen' },
  { value: 'fade', label: 'Ton inn' },
  { value: 'dissolve', label: 'Kryss-ton' },
  { value: 'push-left', label: 'Skyv venstre' },
  { value: 'push-up', label: 'Skyv opp' }
];

export const BASE_SIZE = {
  landscape: { w: 1920, h: 1080 },
  portrait: { w: 1080, h: 1920 }
};
