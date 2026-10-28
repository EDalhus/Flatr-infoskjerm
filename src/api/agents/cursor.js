import { randomUUID } from 'node:crypto';
import { systemPrompt, toolsFor, TOOL_LABEL, WRITES, makeTools } from './tools.js';
import { openRun, closeRun } from './bridge.js';

// Flatr-appen «Cursor AI»: en Cursor Cloud Agent (api.cursor.com) med kundens
// egen nøkkel. Agenten kjører i Cursors sky uten kodelager og bruker de samme
// Flatr-verktøyene som Claude, via MCP-serveren vår (src/api/mcp.js) med en
// nøkkel som bare gjelder mens oppgaven kjører. Samme presentasjon fortsetter
// i samme Cursor-agent (oppfølginger), så Cursor husker samtalen selv.
//
// Samtalen lagres i Flatrs format (ai_messages) for visningen: tankegang som
// «flatr_thinking» (ikke Claudes signerte tenkeblokker), verktøykall som
// tool_use/tool_result, så historikken også er gyldig om kunden bytter til Claude.

export const MODEL_LABEL = 'Cursor';
const API = 'https://api.cursor.com';
const MAX_IMAGES = 5;

class CursorError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function cursor(key, method, path, body) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000)
    });
  } catch {
    throw new CursorError(0, 'Fikk ikke kontakt med Cursor.');
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* ikke JSON */
  }
  if (!res.ok) throw new CursorError(res.status, data?.error?.message || data?.error || data?.message || `Cursor svarte ${res.status}`);
  return data;
}

/** Sjekker en nøkkel før den lagres. Kaster med norsk melding. */
export async function verifyKey(key) {
  if (!/^[\w.-]{20,}$/.test(key)) throw new Error('Det ser ikke ut som en Cursor API-nøkkel.');
  try {
    await cursor(key, 'GET', '/v1/me');
  } catch (err) {
    throw new Error(err.status === 401 || err.status === 403 ? 'Cursor godtok ikke nøkkelen.' : err.message);
  }
}

/** Modellene kontoen kan bruke: [{ id, name }]. */
export async function listModels(key) {
  const data = await cursor(key, 'GET', '/v1/models');
  return (data?.items || data?.models || []).map((m) => ({ id: m.id, name: m.displayName || m.id }));
}

export function errorText(err) {
  if (err instanceof CursorError) {
    if (err.status === 401) return 'Cursor godtok ikke API-nøkkelen. Sjekk den under Flatr Apps → Cursor AI.';
    if (err.status === 403) return 'Cursor-kontoen har ikke tilgang til Cloud Agents (krever et betalt Cursor-abonnement).';
    if (err.status === 429) return 'For mange forespørsler mot Cursor akkurat nå. Prøv igjen om litt.';
    return `Cursor: ${err.message}`;
  }
  return err?.message || 'Noe gikk galt';
}

/* --------------------------------- prompt --------------------------------- */

const RULES = `You are working inside Flatr, a digital signage service, through the MCP server named "flatr".
There is no code repository and no file system for this task: do NOT write files, run commands or open pull requests.
Read and change the presentation ONLY with the flatr tools (get_presentation, add_slide, add_elements, update_elements …).
Always start with get_presentation. When you are done, answer the user briefly in Norwegian (bokmål) with what you changed.`;

/** Fast kontekst som tekst og bilder (Cursor tar ikke imot PDF-er). */
async function contextPart(ids, load) {
  if (!ids) return { text: '', images: [] };
  if (!ids.length) return { text: '\n\n[Kunden har fjernet den faste konteksten. Se bort fra tidligere fast kontekst.]', images: [] };
  const items = load ? await load(ids) : [];
  const images = [];
  const parts = items.map((it) => {
    if (it.image && images.length < MAX_IMAGES) images.push({ data: it.image, mimeType: 'image/jpeg' });
    const title = it.url ? `${it.title} (${it.url})` : it.title;
    if (it.pdf) return `### ${title}\n(PDF-dokument – ikke tilgjengelig som tekst her.)`;
    return `### ${title}\n${it.text || ''}`;
  });
  return {
    text: `\n\n[Fast kontekst fra kunden. Dette erstatter all tidligere fast kontekst. Følg den nøyaktig i alt du lager.]\n\n${parts.join('\n\n')}`,
    images
  };
}

/** Teksten i de siste meldingene, når en ny Cursor-agent må ta over en gammel samtale. */
function recap(messages) {
  const lines = [];
  for (const m of messages.slice(-12)) {
    const text = (m.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    if (text) lines.push(`${m.role === 'user' ? 'Bruker' : 'Assistent'}: ${text.slice(0, 600)}`);
  }
  return lines.length ? `\n\nTidligere i samtalen:\n${lines.join('\n')}` : '';
}

/* ---------------------------------- SSE ----------------------------------- */

/** Leser Cursor-strømmen for en kjøring og kaller onEvent(navn, data). Kobler til igjen ved brudd. */
async function streamRun(key, agentId, runId, onEvent, lock, cancel) {
  let lastId = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    let res;
    try {
      res = await fetch(`${API}/v1/agents/${agentId}/runs/${runId}/stream`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'text/event-stream', ...(lastId ? { 'Last-Event-ID': lastId } : {}) }
      });
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) throw new CursorError(res.status, `Cursor-strømmen svarte ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        if (lock.stop) await cancel();
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          let event = 'message';
          let data = '';
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
            else if (line.startsWith('id:')) lastId = line.slice(3).trim();
          }
          let payload = {};
          try {
            payload = data ? JSON.parse(data) : {};
          } catch {
            /* hopp over */
          }
          if (onEvent(event, payload) === 'end') return;
        }
      }
    } catch {
      /* brudd i strømmen: koble til igjen */
    }
  }
  throw new CursorError(0, 'Mistet kontakten med Cursor underveis.');
}

/* ---------------------------------- kjør ---------------------------------- */

/**
 * Kjører én brukermelding til ferdig. ctx som for claude.js, pluss:
 *   mcpUrl – adressen til MCP-serveren vår (https://<kunde>.flatr.no/api/mcp)
 *   agentId() / setAgentId(id) – Cursor-agenten for denne presentasjonen
 *   contextIds – fast kontekst som skal med (null = uendret)
 */
export async function run(ctx) {
  const { env, playlistId, apiKey, config, lock, send } = ctx;
  const canSee = typeof ctx.screenshot === 'function';
  const tools = makeTools(env, playlistId, { screenshot: ctx.screenshot, photos: ctx.photos });
  const defs = toolsFor({ canSee, photos: !!ctx.photos });

  // Det som skjer, i rekkefølge: tankegang, tekst og verktøykall.
  const blocks = [];
  const add = (type, text) => {
    const last = blocks[blocks.length - 1];
    if (last?.type === type) last.text += text;
    else {
      blocks.push({ type, text });
      send(type === 'thinking' ? 'thinking_start' : 'text_start', {});
    }
    send(type === 'thinking' ? 'thinking_delta' : 'text_delta', { text });
  };

  const token = randomUUID();
  openRun(token, {
    defs,
    call: async (name, input) => {
      const id = `cur_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const block = { type: 'tool', id, name, input };
      blocks.push(block);
      send('tool_start', { id, name, label: TOOL_LABEL[name] || name });
      try {
        const fn = tools[name];
        if (!fn) throw new Error(`Ukjent verktøy ${name}`);
        const out = await fn(input && typeof input === 'object' ? input : {});
        block.ok = true;
        block.result = out?.__image ? out.note || 'Skjermbilde' : JSON.stringify(out ?? { ok: true }).slice(0, 2000);
        send('tool_done', { id, ok: true });
        if (WRITES.has(name)) send('changed', {});
        return out;
      } catch (err) {
        block.ok = false;
        block.result = String(err?.message || err);
        send('tool_done', { id, ok: false, error: block.result });
        throw err;
      }
    }
  });

  const mcpServers = [{ name: 'flatr', type: 'http', url: ctx.mcpUrl, headers: { Authorization: `Bearer ${token}` } }];
  const history = await ctx.messages();
  const message = (history[history.length - 1]?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const context = await contextPart(ctx.contextIds, ctx.contextItems);

  let agentId = ctx.agentId();
  let runId = null;
  try {
    if (agentId) {
      // Oppfølging i samme agent: den husker samtalen og instruksene.
      try {
        const r = await cursor(apiKey, 'POST', `/v1/agents/${agentId}/runs`, {
          prompt: { text: `${message}${context.text}`, ...(context.images.length ? { images: context.images } : {}) },
          mcpServers
        });
        runId = r?.run?.id || r?.id;
      } catch (err) {
        if (![404, 409, 410].includes(err.status)) throw err;
        agentId = null; // utløpt eller arkivert: start en ny agent
      }
    }
    if (!agentId) {
      const pl = await env.DB.prepare('SELECT orientation FROM playlists WHERE id = ?').bind(playlistId).first();
      const system = systemPrompt(pl?.orientation, { canSee, brand: ctx.brand });
      const all = await contextPart(ctx.allContextIds, ctx.contextItems);
      const r = await cursor(apiKey, 'POST', '/v1/agents', {
        prompt: {
          text: `${RULES}\n\n${system}${all.text}${recap(history.slice(0, -1))}\n\nBrukerens melding:\n${message}`,
          ...(all.images.length ? { images: all.images } : {})
        },
        ...(config?.model ? { model: { id: config.model } } : {}),
        mcpServers
      });
      agentId = r?.agent?.id;
      runId = r?.run?.id;
      if (!agentId || !runId) throw new CursorError(0, 'Cursor startet ikke agenten.');
      await ctx.setAgentId(agentId);
    }

    let status = null;
    let failure = null;
    await streamRun(
      apiKey,
      agentId,
      runId,
      (event, d) => {
        if (event === 'assistant' && d.text) add('text', d.text);
        else if (event === 'thinking' && d.text) add('thinking', d.text);
        else if (event === 'status' && d.status) status = d.status;
        else if (event === 'result') status = d.status || status;
        else if (event === 'error') failure = d.message || d.code || 'Ukjent feil';
        else if (event === 'done') return 'end';
        return undefined;
      },
      lock,
      async () => {
        lock.stop = false;
        send('notice', { text: 'Stopper …' });
        await cursor(apiKey, 'POST', `/v1/agents/${agentId}/runs/${runId}/cancel`).catch(() => {});
      }
    );
    if (failure) throw new CursorError(0, failure);
    if (status === 'CANCELLED') send('notice', { text: 'Stoppet.' });
    else if (status && status !== 'FINISHED') send('notice', { text: `Cursor avsluttet (${status.toLowerCase()}).` });
  } finally {
    closeRun(token);
    await saveBlocks(ctx, blocks);
  }
}

/**
 * Lagrer turen som assistent-/brukermeldinger: tekst og tankegang samles til et
 * verktøykall kommer; verktøysvarene følger rett etter, som API-ene krever.
 */
async function saveBlocks(ctx, blocks) {
  let assistant = [];
  let results = [];
  const flush = async () => {
    if (assistant.length) await ctx.save('assistant', assistant);
    if (results.length) await ctx.save('user', results);
    assistant = [];
    results = [];
  };
  for (const b of blocks) {
    if (b.type === 'tool') {
      assistant.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input && typeof b.input === 'object' ? b.input : {} });
      results.push({ type: 'tool_result', tool_use_id: b.id, content: b.result || 'Avbrutt.', ...(b.ok ? {} : { is_error: true }) });
    } else {
      if (results.length) await flush();
      assistant.push(b.type === 'thinking' ? { type: 'flatr_thinking', text: b.text } : { type: 'text', text: b.text });
    }
  }
  await flush();
}
