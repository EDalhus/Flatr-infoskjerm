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

export const FONTS = [
  { value: '', label: 'Standard (Inter)' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: '"Helvetica Neue", Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet MS' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
  { value: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif', label: 'Impact' },
  { value: 'system-ui, sans-serif', label: 'System' }
];

export const FONT_WEIGHTS = [
  { value: 300, label: 'Tynn' },
  { value: 400, label: 'Normal' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Halvfet' },
  { value: 700, label: 'Fet' },
  { value: 800, label: 'Ekstra fet' },
  { value: 900, label: 'Svart' }
];

export const DEFAULT_ELEMENT_CONFIG = {
  text: {
    text: 'Tekst',
    font: '',
    size: 64,
    weight: 700,
    align: 'left',
    valign: 'top',
    color: '#ffffff',
    fill: null, // { type:'gradient', from, to, angle } overstyrer color
    lineHeight: 1.1,
    tracking: 0,
    italic: false,
    underline: false,
    strike: false,
    shadow: false
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
  { type: 'gradient', from: '#f59e0b', to: '#b91c1c', angle: 135 },
  { type: 'dynamic', preset: 'aurora', base: '#0a1a2f', colors: ['#34d399', '#22d3ee', '#3b82f6'] },
  { type: 'dynamic', preset: 'gradient', colors: ['#7c3aed', '#ec4899', '#f59e0b'], angle: 130 },
  { type: 'dynamic', preset: 'waves', base: '#0b1b34', colors: ['#22d3aa', '#0ea5e9', '#1e3a8a'] },
  { type: 'dynamic', preset: 'mesh', base: '#0a0f1e', colors: ['#22d3ee', '#a855f7', '#f43f5e', '#34d399'] }
];

export const DYNAMIC_PRESETS = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'waves', label: 'Bølger' },
  { id: 'mesh', label: 'Mesh' }
];

export function defaultDynamic(preset = 'aurora') {
  return {
    type: 'dynamic',
    preset,
    base: '#0a1a2f',
    colors: ['#34d399', '#22d3ee', '#3b82f6'],
    angle: 130,
    speed: 1
  };
}

export function backgroundStyle(bg) {
  const b = bg && typeof bg === 'object' ? bg : { type: 'color', color: '#0f2733' };
  if (b.type === 'dynamic') {
    return { backgroundColor: b.base || '#0a1a2f' };
  }
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

/** Innebygde lysbilde-maler (Keynote-stil «Velg en layout»). */
export const SLIDE_LAYOUTS = [
  { id: 'blank', label: 'Tom', elements: [] },
  {
    id: 'title',
    label: 'Tittel',
    elements: [
      { kind: 'text', x: 8, y: 36, w: 84, h: 16, config: { text: 'Tittel', size: 120, weight: 800, align: 'center', valign: 'middle', color: '#ffffff' } },
      { kind: 'text', x: 8, y: 55, w: 84, h: 8, config: { text: 'Undertittel', size: 46, weight: 400, align: 'center', color: '#ffffff' } }
    ]
  },
  {
    id: 'title-program',
    label: 'Tittel + program',
    elements: [
      { kind: 'text', x: 6, y: 5, w: 88, h: 12, config: { text: 'Program', size: 84, weight: 800, align: 'left', color: '#ffffff' } },
      { kind: 'program', x: 6, y: 20, w: 88, h: 74, config: { mode: 'agenda', categoryIds: [], max: 10, showCategory: true } }
    ]
  },
  {
    id: 'program-full',
    label: 'Program (fullskjerm)',
    elements: [
      { kind: 'program', x: 4, y: 4, w: 92, h: 92, config: { mode: 'agenda', categoryIds: [], max: 12, showCategory: true } }
    ]
  },
  {
    id: 'now-next',
    label: 'Nå & neste',
    elements: [
      { kind: 'text', x: 6, y: 5, w: 88, h: 12, config: { text: 'Nå & neste', size: 84, weight: 800, align: 'left', color: '#ffffff' } },
      { kind: 'program', x: 6, y: 20, w: 88, h: 58, config: { mode: 'nowNext', categoryIds: [], showCategory: true } }
    ]
  },
  {
    id: 'clock-program',
    label: 'Klokke + program',
    elements: [
      { kind: 'text', x: 6, y: 5, w: 60, h: 12, config: { text: 'Program', size: 80, weight: 800, align: 'left', color: '#ffffff' } },
      { kind: 'clock', x: 72, y: 5, w: 24, h: 16, config: { showDate: true, showSeconds: true } },
      { kind: 'program', x: 6, y: 22, w: 64, h: 72, config: { mode: 'agenda', categoryIds: [], max: 9, showCategory: true } },
      { kind: 'sponsors', x: 72, y: 24, w: 24, h: 40, config: {} }
    ]
  },
  {
    id: 'sponsors',
    label: 'Sponsorer',
    elements: [
      { kind: 'text', x: 8, y: 8, w: 84, h: 10, config: { text: 'Takk til våre sponsorer', size: 60, weight: 700, align: 'center', color: '#ffffff' } },
      { kind: 'sponsors', x: 15, y: 22, w: 70, h: 66, config: {} }
    ]
  },
  {
    id: 'countdown',
    label: 'Nedtelling',
    elements: [
      { kind: 'text', x: 8, y: 16, w: 84, h: 12, config: { text: 'Starter om', size: 68, weight: 700, align: 'center', color: '#ffffff' } },
      { kind: 'countdown', x: 20, y: 34, w: 60, h: 34, config: { mode: 'nextItem', emphasis: 'none' } }
    ]
  },
  {
    id: 'message',
    label: 'Melding',
    elements: [
      { kind: 'text', x: 10, y: 33, w: 80, h: 34, config: { text: 'Din melding her', size: 104, weight: 800, align: 'center', valign: 'middle', color: '#ffffff' } }
    ]
  },
  {
    id: 'qr',
    label: 'QR-kode',
    elements: [
      { kind: 'qr', x: 38, y: 12, w: 24, h: 54, config: { mode: 'schedule' } },
      { kind: 'text', x: 10, y: 70, w: 80, h: 10, config: { text: 'Skann for program', size: 52, weight: 700, align: 'center', color: '#ffffff' } }
    ]
  },
  {
    id: 'image-full',
    label: 'Bilde',
    elements: [{ kind: 'image', x: 0, y: 0, w: 100, h: 100, config: { url: '', fit: 'cover' } }]
  },
  {
    id: 'image-text',
    label: 'Bilde + tittel',
    elements: [
      { kind: 'image', x: 0, y: 0, w: 50, h: 100, config: { url: '', fit: 'cover' } },
      { kind: 'text', x: 56, y: 38, w: 40, h: 14, config: { text: 'Tittel', size: 84, weight: 800, align: 'left', valign: 'middle', color: '#ffffff' } },
      { kind: 'text', x: 56, y: 54, w: 40, h: 10, config: { text: 'Undertekst', size: 38, weight: 400, align: 'left', color: '#ffffff' } }
    ]
  }
];
