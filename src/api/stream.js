import { corsHeaders, buildState, touchScreen, viewerTarget } from './_shared.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET /api/stream?screen=1
// Server-Sent Events. Sender 'snapshot' ved tilkobling og 'update' når data endres.
// På egen server (env.WAIT_CHANGE) venter vi til noe endres hos kunden, og ser
// i tillegg etter hvert 15. sekund (tidsplaner, åpningstider). Ellers poller
// vi D1 og differ på en signatur.
// EventSource i klienten kobler seg til igjen automatisk når vi lukker strømmen.
export async function onRequestGet({ request, env }) {
  const { screenId, playlistId, denied } = await viewerTarget(request, env);
  if (denied) return denied;
  const pollMs = Math.max(1000, Number.parseInt(env.SSE_POLL_MS ?? '3000', 10) || 3000);

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      const comment = (text) => controller.enqueue(encoder.encode(`: ${text}\n\n`));

      // Be klienten vente 5s før reconnect.
      controller.enqueue(encoder.encode('retry: 5000\n\n'));

      let lastVersion = null;

      try {
        await touchScreen(env, screenId);
        const initial = await buildState(env, screenId, { playlistId });
        lastVersion = initial.version;
        send('snapshot', initial);

        // Maks ~10 min per tilkobling, deretter lar vi klienten koble til på nytt.
        const deadline = Date.now() + 10 * 60 * 1000;
        let lastSent = Date.now();

        while (!cancelled && Date.now() < deadline) {
          if (env.WAIT_CHANGE) {
            // Samle endringer som kommer tett (f.eks. flere felt som lagres etter hverandre).
            if (await env.WAIT_CHANGE(Math.min(15_000, deadline - Date.now()))) await sleep(250);
          } else {
            await sleep(pollMs);
          }
          if (cancelled) break;

          let state;
          try {
            state = await buildState(env, screenId, { playlistId });
          } catch (err) {
            send('error', { message: String(err?.message ?? err) });
            continue;
          }

          if (state.version !== lastVersion) {
            lastVersion = state.version;
            send('update', state);
            lastSent = Date.now();
          } else if (Date.now() - lastSent >= 15_000) {
            comment(`keep-alive ${Date.now()}`);
            lastSent = Date.now();
          }
        }
      } catch (err) {
        try {
          send('error', { message: String(err?.message ?? err) });
        } catch {
          /* strømmen er allerede lukket */
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* allerede lukket */
        }
      }
    },
    cancel() {
      cancelled = true;
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...corsHeaders
    }
  });
}

export const onRequestOptions = () =>
  new Response(null, { status: 204, headers: corsHeaders });
