import Anthropic from '@anthropic-ai/sdk';
import { systemPrompt, toolsFor, TOOL_LABEL, WRITES, makeTools } from './tools.js';

// Flatr-appen «Claude AI»: agentløkka mot Claude (Anthropic API) med
// kundens egen nøkkel. Samtalen lagres i Anthropic-formatet (innholdsblokker),
// og tenkeblokkene sendes tilbake uendret hver runde.

export const MODEL = 'claude-opus-5-5';
export const MODEL_LABEL = 'Claude Opus 5.5';
const MAX_STEPS = 40; // verktøyrunder per melding
const EFFORTS = ['low', 'medium', 'high'];

// Strømmer verktøy-input mens den skrives; inputen valideres i verktøyene.
const claudeTools = (canSee) => toolsFor({ canSee }).map((t) => ({ ...t, eager_input_streaming: true }));

/**
 * Bytter ut plassholderne for fast kontekst ({ type: 'flatr_context', ids })
 * med dokumentene: PDF som document-blokk (Claude leser også bildene), tekst og
 * nettsider som tekstdokument (+ skjermbilde). Samme innhold hver gang, så
 * historikken er uendret for API-et og mellomlageret treffer.
 */
export async function expandContext(messages, load) {
  const cache = new Map();
  const blocksFor = async (ids) => {
    const key = ids.join(',');
    if (cache.has(key)) return cache.get(key);
    const items = ids.length && load ? await load(ids) : [];
    const blocks = [];
    for (const it of items) {
      const title = it.url ? `${it.title} (${it.url})` : it.title;
      if (it.pdf) blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: it.pdf }, title });
      else blocks.push({ type: 'document', source: { type: 'text', media_type: 'text/plain', data: it.text || '' }, title });
      if (it.image) blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: it.image } });
    }
    blocks.push({
      type: 'text',
      text: items.length
        ? `[Fast kontekst fra kunden: ${items.map((i) => `«${i.title}»`).join(', ')}. Dette erstatter all tidligere fast kontekst. Følg den nøyaktig i alt du lager.]`
        : '[Kunden har fjernet den faste konteksten. Se bort fra tidligere fast kontekst.]'
    });
    cache.set(key, blocks);
    return blocks;
  };
  const out = [];
  for (const m of messages) {
    if (m.role !== 'user' || !Array.isArray(m.content) || !m.content.some((b) => b.type === 'flatr_context')) {
      out.push(m);
      continue;
    }
    const content = [];
    for (const b of m.content) {
      if (b.type === 'flatr_context') content.push(...(await blocksFor(b.ids || [])));
      else content.push(b);
    }
    out.push({ ...m, content });
  }
  return out;
}

/** Sjekker en nøkkel før den lagres. Kaster med norsk melding. */
export async function verifyKey(key) {
  if (!/^sk-ant-[\w-]{20,}$/.test(key)) throw new Error('Det ser ikke ut som en Claude API-nøkkel (den starter med sk-ant-).');
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 15_000 }).models.retrieve(MODEL);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Claude godtok ikke nøkkelen.');
    if (err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.NotFoundError)
      throw new Error(`Nøkkelen virker, men har ikke tilgang til ${MODEL_LABEL}.`);
    if (err instanceof Anthropic.APIError) throw new Error(`Kunne ikke sjekke nøkkelen (Claude svarte ${err.status ?? 'feil'}).`);
    throw new Error('Fikk ikke kontakt med Claude for å sjekke nøkkelen.');
  }
}

export function errorText(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Claude godtok ikke API-nøkkelen. Sjekk den under Flatr Apps → Claude AI.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'API-nøkkelen har ikke tilgang til modellen.';
  if (err instanceof Anthropic.RateLimitError) return 'For mange forespørsler mot Claude akkurat nå (eller tom kreditt). Prøv igjen om litt.';
  if (err instanceof Anthropic.BadRequestError) return `Claude avviste forespørselen: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Claude svarte med feil ${err.status ?? ''}. Prøv igjen.`;
  return err?.message || 'Noe gikk galt';
}

/**
 * Kjører én brukermelding til ferdig. ctx:
 *   env, playlistId, apiKey, config (appens innstillinger), lock ({ stop }),
 *   messages() -> lagret samtale, save(role, content), send(event, data), usage(u),
 *   screenshot(slideId) -> base64-JPEG | undefined (da kan ikke Claude se lysbildene)
 */
export async function run(ctx) {
  const { env, playlistId, apiKey, config, lock, send } = ctx;
  const client = new Anthropic({ apiKey });
  const canSee = typeof ctx.screenshot === 'function';
  const tools = makeTools(env, playlistId, { screenshot: ctx.screenshot });
  const toolDefs = claudeTools(canSee);
  const pl = await env.DB.prepare('SELECT orientation FROM playlists WHERE id = ?').bind(playlistId).first();
  const system = systemPrompt(pl?.orientation, { canSee });
  const effort = EFFORTS.includes(config?.effort) ? config.effort : 'medium';

  for (let step = 0; step < MAX_STEPS; step++) {
    if (lock.stop) {
      send('notice', { text: 'Stoppet.' });
      return;
    }

    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      system,
      tools: toolDefs,
      messages: await expandContext(await ctx.messages(), ctx.contextItems),
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort },
      cache_control: { type: 'ephemeral' },
      // Avslår Claude en forespørsel, prøver API-et automatisk en annen modell.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default'
    });

    for await (const ev of stream) {
      if (ev.type === 'content_block_start') {
        const b = ev.content_block;
        if (b.type === 'thinking') send('thinking_start', {});
        if (b.type === 'text') send('text_start', {});
        if (b.type === 'tool_use') send('tool_start', { id: b.id, name: b.name, label: TOOL_LABEL[b.name] || b.name });
      } else if (ev.type === 'content_block_delta') {
        if (ev.delta.type === 'thinking_delta') send('thinking_delta', { text: ev.delta.thinking });
        if (ev.delta.type === 'text_delta') send('text_delta', { text: ev.delta.text });
      }
    }

    let message;
    try {
      message = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.APIError) throw err;
      // Verktøy-input som ikke kunne tolkes: prøv steget på nytt.
      send('notice', { text: 'Prøver på nytt …' });
      continue;
    }
    if (message.usage) await ctx.usage(message.usage);

    if (message.stop_reason === 'refusal') {
      await ctx.save('assistant', message.content.length ? message.content : [{ type: 'text', text: '…' }]);
      send('notice', { text: 'Claude ville ikke gjøre dette.' });
      return;
    }
    await ctx.save('assistant', message.content);

    const uses = message.content.filter((b) => b.type === 'tool_use');
    if (message.stop_reason === 'pause_turn') continue;
    if (!uses.length) return; // ferdig
    if (message.stop_reason === 'max_tokens') {
      // Et avkuttet verktøykall skal ikke kjøres; svar med feil så samtalen holder seg gyldig.
      await ctx.save('user', uses.map((u) => ({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'Avbrutt (for langt svar). Del opp i mindre steg.' })));
      continue;
    }

    const results = [];
    let changed = false;
    for (const u of uses) {
      const fn = tools[u.name];
      try {
        if (!fn) throw new Error(`Ukjent verktøy ${u.name}`);
        const out = await fn(u.input && typeof u.input === 'object' ? u.input : {});
        if (out?.__image) {
          // Skjermbilde: Claude ser lysbildet slik det vises på en skjerm.
          results.push({
            type: 'tool_result',
            tool_use_id: u.id,
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: out.__image } },
              { type: 'text', text: out.note || '' }
            ]
          });
        } else {
          results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out ?? { ok: true }) });
        }
        if (WRITES.has(u.name)) changed = true;
        send('tool_done', { id: u.id, ok: true });
      } catch (err) {
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: String(err?.message || err) });
        send('tool_done', { id: u.id, ok: false, error: String(err?.message || err) });
      }
    }
    await ctx.save('user', results);
    if (changed) send('changed', {});
  }
  send('notice', { text: 'Stoppet etter mange steg. Skriv «fortsett» for å fortsette.' });
}
