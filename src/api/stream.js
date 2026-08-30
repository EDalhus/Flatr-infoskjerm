import { corsHeaders, buildState, touchScreen } from './_shared.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET /api/stream?screen=1
// Server-Sent Events. Sender 'snapshot' ved tilkobling og 'update' når data endres.
// Cloudflare Functions er tilstandsløse, så vi poller D1 og differ på en signatur.
// EventSource i klienten kobler seg til igjen automatisk når vi lukker strømmen.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const screenId = url.searchParams.get('screen');
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
      let ticks = 0;

      try {
        await touchScreen(env, screenId);
        const initial = await buildState(env, screenId);
        lastVersion = initial.version;
        send('snapshot', initial);

        // Maks ~10 min per tilkobling, deretter lar vi klienten koble til på nytt.
        const maxTicks = Math.ceil((10 * 60 * 1000) / pollMs);

        while (!cancelled && ticks < maxTicks) {
          await sleep(pollMs);
          ticks++;

          let state;
          try {
            state = await buildState(env, screenId);
          } catch (err) {
            send('error', { message: String(err?.message ?? err) });
            continue;
          }

          if (state.version !== lastVersion) {
            lastVersion = state.version;
            send('update', state);
          } else if (ticks % 5 === 0) {
            comment(`keep-alive ${Date.now()}`);
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
