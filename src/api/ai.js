import { json, badRequest, notFound, handleOptions, readJson, requireAdmin, toIntOrNull, safeJson, previewToken, getTimezone } from './_shared.js';
import { decryptSecret } from './apps.js';
import { AGENTS, AGENT_KINDS } from './agents/index.js';
import { cleanBrand } from '../lib/brand.js';
import { cleanCalls, UNITS } from '../lib/portCalls.js';
import { addPdf, addLink, addText, archiveItem, activeItems, publicItem, loadItems } from './agents/context.js';

// AI-assistenten i editoren (⌘K / AI-fanen). Assistentene er Flatr Apps
// (i dag «Claude AI», se agents/); kunden aktiverer appen og legger inn sin
// egen API-nøkkel der. Assistenten får bare verktøy for å lese og endre DENNE
// presentasjonen (agents/tools.js).
//
//   GET    /api/ai?playlist=1          -> { app, running, messages }
//   POST   /api/ai  { playlist_id, message }  -> SSE: tenking, tekst, verktøy
//   POST   /api/ai?stop=1&playlist=1   -> stopp etter pågående steg
//   DELETE /api/ai?playlist=1          -> tøm samtalen
//
// Fast kontekst (merkevare o.l., se agents/context.js):
//   GET    /api/ai?context=1                         -> dokumentene
//   POST   /api/ai?context=link   { url, title? }
//   POST   /api/ai?context=text   { text, title? }
//   POST   /api/ai?context=pdf&name=…   (rå PDF i body)
//   DELETE /api/ai?context=<id>
// Konteksten legges inn i samtalen som en plassholder ({ type: 'flatr_context',
// ids }) når den er ny eller endret, og agenten bytter den ut med innholdet.
//
// Samtalen lagres som innholdsblokker i Anthropic-formatet (ai_messages).

const running = new Map(); // `${tenant}:${playlist}` -> { stop }

/** Den aktiverte assistent-appen (første), med nøkkel. null = ingen aktivert. */
async function assistantApp(env) {
  const marks = AGENT_KINDS.map(() => '?').join(',');
  const row = await env.DB.prepare(`SELECT * FROM apps WHERE kind IN (${marks}) ORDER BY id LIMIT 1`).bind(...AGENT_KINDS).first();
  if (!row) return null;
  let apiKey = null;
  if (row.secret) {
    try {
      apiKey = safeJson(await decryptSecret(env, row.secret), {}).api_key || null;
    } catch {
      apiKey = null;
    }
  }
  return { row, config: safeJson(row.config, {}), apiKey, agent: AGENTS[row.kind] };
}

const publicAssistant = (a) =>
  a
    ? {
        id: a.row.id,
        kind: a.row.kind,
        name: a.row.name,
        model: a.agent.MODEL_LABEL,
        effort: a.config.effort || 'medium',
        has_key: !!a.apiKey,
        key_hint: a.config.key_hint || null,
        usage: a.config.usage || null,
        context: activeItems(a.config).map(publicItem)
      }
    : null;

/** Lagrer appens config (uten å røre andre felt enn de som endres). */
async function saveConfig(env, appId, config) {
  await env.DB.prepare(`UPDATE apps SET config = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).bind(JSON.stringify(config), appId).run();
}

/** Kontekst-id-ene samtalen sist fikk (siste plassholder), eller null hvis aldri. */
function lastContextIds(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const block = (messages[i].content || []).find?.((b) => b.type === 'flatr_context');
    if (block) return block.ids || [];
  }
  return null;
}
const sameIds = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/* --------------------------------- lagring -------------------------------- */

async function history(env, playlistId) {
  const { results } = await env.DB.prepare('SELECT id, role, content, author, created_at FROM ai_messages WHERE playlist_id = ? ORDER BY id').bind(playlistId).all();
  return (results ?? []).map((r) => ({ ...r, content: safeJson(r.content, []) }));
}

const save = (env, playlistId, role, content, author = null) =>
  env.DB.prepare('INSERT INTO ai_messages (playlist_id, role, content, author) VALUES (?, ?, ?, ?)')
    .bind(playlistId, role, JSON.stringify(content), author)
    .run();

/**
 * Et verktøykall uten svar (f.eks. hvis serveren startet på nytt midt i en
 * runde) gjør samtalen ugyldig for API-et. Legg inn et feilsvar der det mangler.
 */
function repair(messages) {
  const out = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    out.push(m);
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    const uses = m.content.filter((b) => b.type === 'tool_use').map((b) => b.id);
    if (!uses.length) continue;
    const next = messages[i + 1];
    const answered = new Set(
      next?.role === 'user' && Array.isArray(next.content) ? next.content.filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id) : []
    );
    const missing = uses.filter((id) => !answered.has(id));
    if (!missing.length) continue;
    const results = missing.map((id) => ({ type: 'tool_result', tool_use_id: id, is_error: true, content: 'Avbrutt.' }));
    if (next?.role === 'user' && Array.isArray(next.content)) {
      messages[i + 1] = { ...next, content: [...results, ...next.content] };
    } else {
      out.push({ role: 'user', content: results });
    }
  }
  return out;
}

/**
 * Skjermbilde av ett lysbilde via forhåndsvisningen (/preview/<id>?slide=),
 * med en kortlivet signert lenke (rt). undefined = ingen konverter her.
 */
function slideScreenshot(env, request, playlistId) {
  const host = request.headers.get('host');
  if (!env.SCREENSHOT || !host) return undefined;
  const origin = `${globalThis.process?.env?.PUBLIC_PROTOCOL || 'https'}://${host}`;
  return async (slideId) => {
    const pl = await env.DB.prepare('SELECT orientation FROM playlists WHERE id = ?').bind(playlistId).first();
    const portrait = pl?.orientation === 'portrait';
    const rt = await previewToken(env, playlistId, 300);
    const [width, height] = portrait ? [720, 1280] : [1280, 720];
    const image = await env.SCREENSHOT(`${origin}/preview/${playlistId}?slide=${slideId}&vw=${width}&vh=${height}&rt=${encodeURIComponent(rt)}`, {
      width,
      height,
      waitSeconds: 4 // widgeter (vær, kart) laster data
    });
    return Buffer.from(image).toString('base64');
  };
}

/** Merkevaresettet (Merkevare-siden), eller null. */
async function readBrand(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'brand'`).first();
  return row?.value ? cleanBrand(safeJson(row.value, {})) : null;
}

/** Legger forbruket (tokens) til i appens innstillinger. */
async function addUsage(env, appId, usage) {
  const row = await env.DB.prepare('SELECT config FROM apps WHERE id = ?').bind(appId).first();
  const config = safeJson(row?.config, {});
  const u = config.usage || { input: 0, output: 0, cache_read: 0, cache_write: 0, since: new Date().toISOString() };
  u.input += usage.input_tokens || 0;
  u.output += usage.output_tokens || 0;
  u.cache_read += usage.cache_read_input_tokens || 0;
  u.cache_write += usage.cache_creation_input_tokens || 0;
  await env.DB.prepare('UPDATE apps SET config = ? WHERE id = ?').bind(JSON.stringify({ ...config, usage: u }), appId).run();
}

/* -------------------------------- endepunkt ------------------------------- */

const lockKey = (env, playlistId) => `${env.TENANT?.slug || '-'}:${playlistId}`;

export async function onRequestGet(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { env, request } = context;
  const playlistId = toIntOrNull(new URL(request.url).searchParams.get('playlist'));
  const app = publicAssistant(await assistantApp(env));
  if (!playlistId) return json({ app });
  return json({ app, running: running.has(lockKey(env, playlistId)), messages: await history(env, playlistId) });
}

export async function onRequestDelete(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { env, request } = context;
  const contextId = new URL(request.url).searchParams.get('context');
  if (contextId) {
    const a = await assistantApp(env);
    if (!a) return notFound('Ingen AI-app er aktivert');
    await saveConfig(env, a.row.id, archiveItem(a.config, contextId));
    return json(publicAssistant(await assistantApp(env)));
  }
  const playlistId = toIntOrNull(new URL(request.url).searchParams.get('playlist'));
  if (!playlistId) return badRequest('playlist er påkrevd');
  if (running.has(lockKey(env, playlistId))) return json({ error: 'Assistenten jobber – stopp den først' }, { status: 409 });
  await env.DB.prepare('DELETE FROM ai_messages WHERE playlist_id = ?').bind(playlistId).run();
  return json({ ok: true });
}

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { env, request } = context;
  const params = new URL(request.url).searchParams;

  // ?parse=calls { text }: tolk anløp fra fri tekst (NAIS → Anløp → Importer).
  if (params.get('parse') === 'calls') {
    const a = await assistantApp(env);
    if (!a?.apiKey || !a.agent.parseCalls) return json({ error: 'Krever Claude AI med API-nøkkel', code: 'no_ai' }, { status: 400 });
    const b = (await readJson(request)) || {};
    const ais = await env.DB.prepare(`SELECT config FROM apps WHERE kind = 'ais' ORDER BY id LIMIT 1`).first();
    const config = safeJson(ais?.config, {});
    try {
      const tz = await getTimezone(env);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
      const calls = await a.agent.parseCalls(a.apiKey, b.text || '', { fleet: config.fleet || [], quays: config.quays || [], today, units: UNITS });
      return json({ calls: cleanCalls(calls) });
    } catch (err) {
      return json({ error: a.agent.errorText(err) }, { status: 502 });
    }
  }

  const ctxKind = params.get('context');
  if (ctxKind) {
    const a = await assistantApp(env);
    if (!a) return notFound('Aktiver Claude AI først');
    try {
      let config;
      if (ctxKind === 'pdf') {
        config = await addPdf(env, a.config, await request.arrayBuffer(), params.get('name'));
      } else {
        const b = (await readJson(request)) || {};
        if (ctxKind === 'link') config = await addLink(env, a.config, b.url, b.title);
        else if (ctxKind === 'text') config = await addText(env, a.config, b.text, b.title);
        else return badRequest('Ukjent type');
      }
      await saveConfig(env, a.row.id, config);
      return json(publicAssistant(await assistantApp(env)), { status: 201 });
    } catch (err) {
      return json({ error: err.message || 'Kunne ikke legge til' }, { status: 400 });
    }
  }

  if (params.get('stop')) {
    const lock = running.get(lockKey(env, toIntOrNull(params.get('playlist'))));
    if (lock) lock.stop = true;
    return json({ ok: true });
  }

  const b = (await readJson(request)) || {};
  const playlistId = toIntOrNull(b.playlist_id);
  const message = String(b.message || '').trim().slice(0, 8000);
  if (!playlistId) return badRequest('playlist_id er påkrevd');
  if (!message) return badRequest('Skriv hva du vil ha');
  const pl = await env.DB.prepare('SELECT id FROM playlists WHERE id = ?').bind(playlistId).first();
  if (!pl) return notFound('Presentasjonen finnes ikke');
  const assistant = await assistantApp(env);
  if (!assistant) return json({ error: 'Aktiver Claude AI under Flatr Apps først.', code: 'no_app' }, { status: 400 });
  if (!assistant.apiKey) return json({ error: 'Legg inn en API-nøkkel i Claude AI-appen først.', code: 'no_key' }, { status: 400 });

  const key = lockKey(env, playlistId);
  if (running.has(key)) return json({ error: 'Assistenten jobber allerede med denne presentasjonen' }, { status: 409 });
  const lock = { stop: false };
  running.set(key, lock);

  const author = env.SESSION_USER?.name || env.SESSION_USER?.email || null;
  // Fast kontekst følger med når den er ny for samtalen eller er endret siden sist.
  const activeIds = activeItems(assistant.config).map((i) => i.id);
  const sentIds = lastContextIds(await history(env, playlistId));
  const withContext = sentIds === null ? activeIds.length > 0 : !sameIds(sentIds, activeIds);
  const content = [...(withContext ? [{ type: 'flatr_context', ids: activeIds }] : []), { type: 'text', text: message }];
  const first = await env.DB.prepare('INSERT INTO ai_messages (playlist_id, role, content, author) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(playlistId, 'user', JSON.stringify(content), author)
    .first();
  let answered = false;

  const brand = await readBrand(env);
  const enc = new TextEncoder();
  let closed = false;
  const body = new ReadableStream({
    start(controller) {
      const send = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      // Jobben fortsetter selv om nettleseren lukkes, så samtalen alltid blir hel.
      assistant.agent
        .run({
          env,
          playlistId,
          apiKey: assistant.apiKey,
          config: assistant.config,
          lock,
          send,
          messages: async () => repair((await history(env, playlistId)).map((m) => ({ role: m.role, content: m.content }))),
          save: (role, content) => {
            answered = true;
            return save(env, playlistId, role, content);
          },
          usage: (u) => addUsage(env, assistant.row.id, u),
          screenshot: slideScreenshot(env, request, playlistId),
          contextItems: (ids) => loadItems(env, assistant.config, ids),
          brand
        })
        .catch(async (err) => {
          console.warn('[ai]', err?.message || err);
          // Feilet før noe svar (f.eks. ugyldig nøkkel): ta meldingen ut igjen, så den kan sendes på nytt.
          if (!answered) await env.DB.prepare('DELETE FROM ai_messages WHERE id = ?').bind(first.id).run().catch(() => {});
          send('error', { message: assistant.agent.errorText(err), retry: !answered });
        })
        .finally(() => {
          running.delete(key);
          send('done', {});
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              /* allerede lukket */
            }
          }
        });
    },
    cancel() {
      closed = true;
    }
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}

export const onRequestOptions = handleOptions;
