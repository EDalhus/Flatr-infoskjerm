import { safeJson, toIntOrNull } from '../_shared.js';
import { routeApi } from '../../router.js';
import { DEFAULT_ELEMENT_CONFIG, BASE_SIZE, FONTS } from '../../lib/deck.js';
import { brandIsEmpty, BRAND_COLORS } from '../../lib/brand.js';

// Felles for alle AI-assistentene (Claude AI, senere andre): instruksene om
// Flatr-lerretet og verktøyene som leser og endrer ÉN presentasjon. Hvert
// verktøykall går gjennom de vanlige API-ene med brukerens rettigheter.
// Skjemaene er JSON Schema; hver agent oversetter til sitt eget format.

/* ------------------------------ systemprompt ------------------------------ */

export const KINDS_DOC = `Element kinds and their config (only set the fields you need; the rest get defaults):
- text: { text ('\\n' = line break), size (px on the canvas), weight (300-900), align: left|center|right, valign: top|middle|bottom, color '#rrggbb', font, lineHeight (1.0-1.4), tracking (letter spacing in px, e.g. 4-12 for small caps-style labels), italic, shadow (true = soft drop shadow), fill: null | { type:'gradient', from, to, angle } (gradient text) }
  font is exactly one of these values (label in parentheses): ${FONTS.map((f) => `${JSON.stringify(f.value)} (${f.label})`).join(', ')}. Pair a characterful heading font with a calm body font.
  Emoji render in colour and work well as large icons (a text element with one emoji at 120-260 px).
- shape: { shape: 'rect'|'ellipse'|'triangle', fill '#rrggbb', radius (px, rect only), opacity (0-100) }. Shapes may extend past the canvas edge (x or y below 0 or w beyond 100) – use that for big decorative circles and colour blocks.
- image: { url (only urls from list_media), fit: 'contain'|'cover', radius }
- clock: { showDate, showSeconds, frame }
- countdown: { mode: 'nextItem'|'target', target (ISO datetime when mode=target), title, doneText }
- program: the event programme from Flatr's Program page: { mode: 'agenda'|'now', max, categoryIds: [], showCategory, frame }
- qr: { mode: 'url'|'schedule', url, label, caption, frame }
- weather: { place, lat, lon, layout: 'now'|'days', color, frame }
- rss: news headlines { url, mode: 'ticker'|'list', max, color, showSource }
- calendar: { url (iCal), max, days, showLocation, color, frame }
- carousel: images from a media-library folder { folder, seconds, fit, transition }
- video: { url (YouTube or uploaded video), loop, mute, fit }
- web: a web page { url, refreshMinutes }
- app: a Flatr App from list_data.apps. AIS apps: { appId, view: 'map'|'cards'|'arrivals'|'calls', quayId, groups: [] }; view 'calls' is the port-call schedule (planned arrivals with cargo and next port) with { title, callDays: 1-30 }. Birthdays: { appId, days: 1-7, title, valign: top|middle|bottom }. Cake rain (birthdays effect layer, full slide, in front): { appId, effect: 'rain', amount: 'few'|'normal'|'many', opacity }.
Widgets with frame:true get a dark translucent card behind them.`;

/** Merkevaresettet som bindende regler (tom streng hvis ikke satt). */
function brandSection(b) {
  if (brandIsEmpty(b)) return '';
  const lines = [];
  if (b.name) lines.push(`- Company / brand: ${b.name}`);
  if (b.logo) lines.push(`- Logo (image url, use it with an image element – never recreate it with text): ${b.logo}`);
  for (const { key, label } of BRAND_COLORS) if (b.colors?.[key]) lines.push(`- ${label} (${key}): ${b.colors[key]}`);
  for (const c of b.extra || []) lines.push(`- Extra colour ${c.name || ''}: ${c.hex}`);
  if (b.fonts?.heading) lines.push(`- Heading font: ${JSON.stringify(b.fonts.heading)}`);
  if (b.fonts?.body) lines.push(`- Body font: ${JSON.stringify(b.fonts.body)}`);
  if (b.notes) lines.push(`- Rules from the customer: ${b.notes}`);
  return `\n\n# The account's brand kit (binding)\nUse exactly these. Build your palette from these colours only (tints/opacity of them are fine); use these fonts for headings and body; place the logo where it fits the composition (typically a corner, small).\n${lines.join('\n')}`;
}

export function systemPrompt(orientation, { canSee = false, brand = null } = {}) {
  const size = BASE_SIZE[orientation === 'portrait' ? 'portrait' : 'landscape'];
  return `You are the art director and designer inside Flatr, a Norwegian digital-signage service. You build and edit ONE presentation (slides shown on TV screens in workplaces, receptions and canteens) using the tools. You cannot change screens, users or settings – only this presentation.

Always reply in the language the user writes in (usually Norwegian bokmål). Keep replies short: say what you made and what the user should check, not how.

# Canvas
${size.w}×${size.h} px (${orientation}). Element x, y, w, h are PERCENT of the canvas (0–100, origin top-left). Text size is px on that canvas. z orders layers (higher = in front). A text box must be tall enough for its text: h ≈ lines × size × lineHeight / ${size.h} × 100 (plus a little air), and wide enough that lines don't wrap unexpectedly (an average character is ~0.55 × size wide).

# What good looks like
These screens hang on walls. People glance at them for a few seconds from several metres away. A good slide is read in three seconds and has a personality that fits the place. Bland, generic, templated slides are a failure even when they are tidy.

Before building, decide a concept and say it to yourself in one line: who looks at this screen, where, and what mood fits (e.g. "warm Nordic canteen", "confident industrial, safety-first", "playful and celebratory"). Derive from it:
- A palette: one dominant background family, one or two neutrals, ONE strong accent used sparingly. Make it specific to the subject – industrial minerals is not the same blue as a law firm. Dark and light slides can be mixed in the same deck if the palette holds them together.
- A type system: a headline style (font, weight, size) and a body style, used consistently. Use scale contrast boldly: hero headlines 160–260 px, section titles 100–140 px, body 48–64 px, labels 30–36 px with tracking 6–10 in the accent colour. Never body text below 40 px.

Compose each slide around ONE hero – a huge number, a big word, a large emoji/icon, a photo, or a live widget given real space – and let everything else support it. Vary the composition between slides; never use the same layout on two slides in a row, and don't put a title in the top-left corner of every slide. Useful layouts:
- Split: a full-height colour block or photo covering 40–50 % on one side, text on the other.
- Big statement: one short sentence at 160+ px, centred or anchored bottom-left, lots of space.
- Big number: a statistic or price at 250+ px with a short label.
- Icon list: 3 items max, each with a large emoji or a numbered ellipse, short text.
- Widget stage: the widget fills most of the slide (60–90 %), with a small label or headline.
- Card: content on a rounded rect (radius 32–48, opacity 85–95) over a rich background.
Add depth with layered shapes: oversized ellipses bleeding off an edge at low opacity (10–25 %), a thin accent rule, a colour block behind a widget. Use dynamic backgrounds (aurora, waves, mesh) on one or two hero slides, not on everything.

Copy: write like a good Norwegian copywriter – concrete, warm and specific to the place, not corporate filler. Headlines 2–6 words. Max ~15 words of body text per slide. When you must invent example content (menu items, safety rules), keep it plausible and say in your reply that it is an example to replace.

Durations: 8–12 s for short statements, 15–20 s for widgets and lists.

# The customer's fixed context
The customer can attach fixed context – brand guidelines, design manuals, tone of voice, facts about the company – as documents in the conversation, marked «Fast kontekst fra kunden». When present it is binding and overrides the generic advice above. Follow it to the letter: exact colour values (hex), typography (if their font is not available, use the closest available one and say which you substituted), logo rules (use their logo from list_media if it exists – never imitate a logo with text), spacing and composition rules, tone of voice and wording, do's and don'ts. When guidelines are ambiguous, choose the most conservative interpretation. Mention briefly in your reply which guidelines you followed.

# Work method
1. get_presentation first. Use list_media / list_data before using images, apps or programme categories – never invent URLs or ids. Use the customer's own images and logo when they exist.
2. For a new presentation: decide the concept, then build slide by slide with add_slide (pass elements directly). Name each slide.
${canSee ? `3. After building or changing a slide, call look_at_slide and LOOK at it critically like a demanding art director: text cut off or overflowing, overlaps, things too small to read from a distance, empty or unbalanced areas, weak contrast, everything looking the same. Fix what you see with update_elements and look again. Do this for every slide you make – it is the most important step.
4.` : '3.'} When editing, change what was asked and keep the rest. Deleting moves things to the trash.

${KINDS_DOC}

Backgrounds: { type:'color', color } | { type:'gradient', from, to, angle } | { type:'dynamic', preset:'aurora'|'gradient'|'waves'|'mesh', base, colors:[2-4 colours] } | { type:'image', url, fit }.
Transitions (update_slide): none | fade | dissolve | push-left | push-up.${brandSection(brand)}`;
}

/* --------------------------------- verktøy -------------------------------- */

const elementSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: Object.keys(DEFAULT_ELEMENT_CONFIG) },
    x: { type: 'number' },
    y: { type: 'number' },
    w: { type: 'number' },
    h: { type: 'number' },
    rotation: { type: 'number' },
    config: { type: 'object', description: 'Kind-specific settings, see the system prompt.' }
  },
  required: ['kind', 'x', 'y', 'w', 'h']
};
const backgroundSchema = { type: 'object', description: 'Slide background, see the system prompt.' };

export const TOOLS = [
  {
    name: 'get_presentation',
    description: 'Read the presentation: name, orientation, and every slide with its elements (ids, positions, config).',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'set_presentation',
    description: 'Rename the presentation or change its orientation (landscape | portrait).',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, orientation: { type: 'string', enum: ['landscape', 'portrait'] } } }
  },
  {
    name: 'add_slide',
    description: 'Add a slide, optionally with its elements. Placed after after_slide_id, or last.',
    input_schema: {
      type: 'object',
      properties: {
        after_slide_id: { type: 'integer' },
        name: { type: 'string' },
        duration_seconds: { type: 'integer' },
        background: backgroundSchema,
        elements: { type: 'array', items: elementSchema }
      }
    }
  },
  {
    name: 'update_slide',
    description: 'Change a slide: name, duration, background, transition (none|fade|dissolve|push-left|push-up) or enabled.',
    input_schema: {
      type: 'object',
      properties: {
        slide_id: { type: 'integer' },
        name: { type: 'string' },
        duration_seconds: { type: 'integer' },
        background: backgroundSchema,
        transition: { type: 'string' },
        enabled: { type: 'boolean' }
      },
      required: ['slide_id']
    }
  },
  {
    name: 'move_slide',
    description: 'Move a slide to a new 0-based index in the presentation.',
    input_schema: { type: 'object', properties: { slide_id: { type: 'integer' }, index: { type: 'integer' } }, required: ['slide_id', 'index'] }
  },
  {
    name: 'delete_slide',
    description: 'Delete a slide (moved to the trash).',
    input_schema: { type: 'object', properties: { slide_id: { type: 'integer' } }, required: ['slide_id'] }
  },
  {
    name: 'add_elements',
    description: 'Add elements to a slide.',
    input_schema: { type: 'object', properties: { slide_id: { type: 'integer' }, elements: { type: 'array', items: elementSchema } }, required: ['slide_id', 'elements'] }
  },
  {
    name: 'update_elements',
    description: 'Change elements. config is merged into the existing config (only send the fields that change).',
    input_schema: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' },
              z: { type: 'integer' },
              rotation: { type: 'number' },
              config: { type: 'object' }
            },
            required: ['id']
          }
        }
      },
      required: ['updates']
    }
  },
  {
    name: 'delete_elements',
    description: 'Delete elements (moved to the trash).',
    input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'integer' } } }, required: ['ids'] }
  },
  {
    name: 'look_at_slide',
    description: 'Take a screenshot of a slide exactly as it looks on a screen (with live widgets). Use it to check and improve your design.',
    input_schema: { type: 'object', properties: { slide_id: { type: 'integer' } }, required: ['slide_id'] }
  },
  {
    name: 'list_media',
    description: 'Images and videos in the media library (url, name, folder). Use these urls for image elements and backgrounds.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'list_data',
    description: 'What else the account has: Flatr Apps (id, kind, name), programme categories, and the next programme items.',
    input_schema: { type: 'object', properties: {} }
  }
];

/** Verktøyene en agent kan bruke nå (look_at_slide bare når skjermbilder virker). */
export const toolsFor = ({ canSee }) => TOOLS.filter((t) => canSee || t.name !== 'look_at_slide');

export const TOOL_LABEL = {
  get_presentation: 'Leser presentasjonen',
  set_presentation: 'Endrer presentasjonen',
  add_slide: 'Lager lysbilde',
  update_slide: 'Endrer lysbilde',
  move_slide: 'Flytter lysbilde',
  delete_slide: 'Sletter lysbilde',
  add_elements: 'Legger til elementer',
  update_elements: 'Endrer elementer',
  delete_elements: 'Sletter elementer',
  look_at_slide: 'Ser på lysbildet',
  list_media: 'Ser i biblioteket',
  list_data: 'Ser på apper og program'
};
export const WRITES = new Set(['set_presentation', 'add_slide', 'update_slide', 'move_slide', 'delete_slide', 'add_elements', 'update_elements', 'delete_elements']);

/** Kaller et vanlig API-endepunkt i samme forespørsel (samme bruker og rettigheter). */
async function call(env, method, path, body) {
  const res = await routeApi(
    new Request(`http://flatr.internal${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
    env
  );
  const text = await res.text();
  const data = text ? safeJson(text, null) : null;
  if (!res.ok) throw new Error(data?.error || `${method} ${path} svarte ${res.status}`);
  return data;
}

const round = (n) => Math.round(Number(n) * 100) / 100;
const clampPct = (n, d) => (Number.isFinite(Number(n)) ? round(Math.min(200, Math.max(-100, Number(n)))) : d);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function normElement(e) {
  const kind = Object.hasOwn(DEFAULT_ELEMENT_CONFIG, e?.kind) ? e.kind : null;
  if (!kind) throw new Error(`Ukjent elementtype: ${e?.kind}`);
  return {
    kind,
    x: clampPct(e.x, 10),
    y: clampPct(e.y, 10),
    w: Math.max(0.5, clampPct(e.w, 30)),
    h: Math.max(0.5, clampPct(e.h, 20)),
    rotation: Number(e.rotation) || 0,
    config: { ...structuredClone(DEFAULT_ELEMENT_CONFIG[kind]), ...obj(e.config) }
  };
}

/**
 * opts.screenshot(slideId) -> base64-JPEG av lysbildet, eller null hvis det
 * ikke går (da fjernes look_at_slide fra verktøylista, se toolsFor).
 */
export function makeTools(env, playlistId, opts = {}) {
  const slideOf = async (slideId) => {
    const s = await env.DB.prepare('SELECT * FROM deck_slides WHERE id = ? AND playlist_id = ?').bind(toIntOrNull(slideId), playlistId).first();
    if (!s) throw new Error(`Lysbilde ${slideId} finnes ikke i denne presentasjonen`);
    return s;
  };
  const elementOf = async (id) => {
    const e = await env.DB.prepare(
      'SELECT e.* FROM deck_elements e JOIN deck_slides s ON s.id = e.slide_id WHERE e.id = ? AND s.playlist_id = ?'
    )
      .bind(toIntOrNull(id), playlistId)
      .first();
    if (!e) throw new Error(`Element ${id} finnes ikke i denne presentasjonen`);
    return e;
  };
  const slideIds = async () =>
    ((await env.DB.prepare('SELECT id FROM deck_slides WHERE playlist_id = ? ORDER BY position ASC, id ASC').bind(playlistId).all()).results ?? []).map(
      (r) => r.id
    );
  const reorder = async (ids) => {
    for (let i = 0; i < ids.length; i++) await env.DB.prepare('UPDATE deck_slides SET position = ? WHERE id = ?').bind(i, ids[i]).run();
  };

  return {
    async get_presentation() {
      const pl = await call(env, 'GET', `/api/playlists?id=${playlistId}`);
      const deck = await call(env, 'GET', `/api/deck?playlist=${playlistId}`);
      return {
        name: pl?.name,
        orientation: pl?.orientation,
        slides: (deck || []).map((s, i) => ({
          index: i,
          id: s.id,
          name: s.name,
          duration_seconds: s.duration_seconds,
          enabled: !!s.enabled,
          background: s.background,
          elements: s.elements.map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, w: e.w, h: e.h, z: e.z, rotation: e.rotation || 0, config: e.config }))
        }))
      };
    },
    async set_presentation(input) {
      const body = {};
      if (input.name) body.name = String(input.name).slice(0, 120);
      if (input.orientation) body.orientation = input.orientation;
      const pl = await call(env, 'PUT', `/api/playlists?id=${playlistId}`, body);
      return { name: pl.name, orientation: pl.orientation };
    },
    async add_slide(input) {
      const elements = (Array.isArray(input.elements) ? input.elements : []).map(normElement).map((e, i) => ({ ...e, z: i }));
      const created = await call(env, 'POST', '/api/deck-slides', { playlist_id: playlistId, name: input.name || null, elements });
      const patch = {};
      if (input.duration_seconds) patch.duration_seconds = input.duration_seconds;
      if (input.background) patch.background = obj(input.background);
      if (Object.keys(patch).length) await call(env, 'PUT', `/api/deck-slides?id=${created.id}`, patch);
      if (input.after_slide_id) {
        const ids = (await slideIds()).filter((id) => id !== created.id);
        const at = ids.indexOf(toIntOrNull(input.after_slide_id));
        if (at >= 0) {
          ids.splice(at + 1, 0, created.id);
          await reorder(ids);
        }
      }
      const els = (await env.DB.prepare('SELECT id, kind FROM deck_elements WHERE slide_id = ? ORDER BY z, id').bind(created.id).all()).results ?? [];
      return { slide_id: created.id, element_ids: els.map((e) => e.id) };
    },
    async update_slide(input) {
      await slideOf(input.slide_id);
      const patch = {};
      for (const k of ['name', 'duration_seconds', 'transition', 'enabled']) if (input[k] !== undefined) patch[k] = input[k];
      if (input.background) patch.background = obj(input.background);
      await call(env, 'PUT', `/api/deck-slides?id=${toIntOrNull(input.slide_id)}`, patch);
      return { ok: true };
    },
    async move_slide(input) {
      const s = await slideOf(input.slide_id);
      const ids = (await slideIds()).filter((id) => id !== s.id);
      ids.splice(Math.max(0, Math.min(ids.length, toIntOrNull(input.index) ?? ids.length)), 0, s.id);
      await reorder(ids);
      return { order: ids };
    },
    async delete_slide(input) {
      const s = await slideOf(input.slide_id);
      await call(env, 'DELETE', `/api/deck-slides?id=${s.id}`);
      return { ok: true };
    },
    async add_elements(input) {
      const s = await slideOf(input.slide_id);
      const ids = [];
      for (const raw of Array.isArray(input.elements) ? input.elements : []) {
        const created = await call(env, 'POST', '/api/deck-elements', { slide_id: s.id, ...normElement(raw) });
        ids.push(created.id);
      }
      return { element_ids: ids };
    },
    async update_elements(input) {
      let n = 0;
      for (const u of Array.isArray(input.updates) ? input.updates : []) {
        const cur = await elementOf(u.id);
        const patch = {};
        for (const k of ['x', 'y', 'w', 'h']) if (u[k] !== undefined) patch[k] = clampPct(u[k], cur[k]);
        if (u.z !== undefined) patch.z = toIntOrNull(u.z) ?? cur.z;
        if (u.rotation !== undefined) patch.rotation = Number(u.rotation) || 0;
        if (u.config) patch.config = { ...safeJson(cur.config, {}), ...obj(u.config) };
        await call(env, 'PUT', `/api/deck-elements?id=${cur.id}`, patch);
        n++;
      }
      return { updated: n };
    },
    async delete_elements(input) {
      let n = 0;
      for (const id of Array.isArray(input.ids) ? input.ids : []) {
        const cur = await elementOf(id);
        await call(env, 'DELETE', `/api/deck-elements?id=${cur.id}`);
        n++;
      }
      return { deleted: n };
    },
    async look_at_slide(input) {
      const s = await slideOf(input.slide_id);
      if (!opts.screenshot) throw new Error('Skjermbilder er ikke tilgjengelig her');
      const data = await opts.screenshot(s.id);
      return { __image: data, note: `Slide ${s.id}${s.name ? ` «${s.name}»` : ''}` };
    },
    async list_media() {
      const rows = await call(env, 'GET', '/api/media');
      return (rows || [])
        .filter((m) => /^(image|video)\//.test(m.content_type || ''))
        .slice(0, 200)
        .map((m) => ({ name: m.name, url: `/api/media?id=${m.id}&raw=1`, folder: m.folder || null, type: m.content_type }));
    },
    async list_data() {
      const [apps, categories, schedule] = await Promise.all([
        call(env, 'GET', '/api/apps').catch(() => []),
        call(env, 'GET', '/api/categories').catch(() => []),
        call(env, 'GET', '/api/schedule').catch(() => [])
      ]);
      return {
        apps: (apps || []).map((a) => ({ id: a.id, kind: a.kind, name: a.name, quays: a.config?.quays?.map((q) => ({ id: q.id, name: q.name })), groups: [...new Set((a.config?.fleet || []).map((b) => b.group).filter(Boolean))] })),
        categories: (categories || []).map((c) => ({ id: c.id, name: c.name })),
        programme: (Array.isArray(schedule) ? schedule : []).slice(0, 15).map((i) => ({ title: i.title, start: i.start_time, end: i.end_time, stage: i.stage || null }))
      };
    }
  };
}

