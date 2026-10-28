import { json, noContent, handleOptions } from './_shared.js';
import { runFor } from './agents/bridge.js';

// POST /api/mcp – MCP-server (Streamable HTTP, JSON-RPC) for Cursor AI.
// Cursor-agenten (agents/cursor.js) får adressen og en nøkkel som bare gjelder
// mens oppgaven kjører; verktøyene er de samme som Claude bruker
// (agents/tools.js) og kjører med rettighetene til den som startet oppgaven.
// Svarene sendes som vanlig JSON (ingen SSE-strøm fra serveren).

const PROTOCOL = '2025-06-18';
const rpc = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg, run) {
  const { id, method, params } = msg || {};
  // Varsler (uten id) skal ikke ha svar.
  if (id === undefined || id === null) return null;
  switch (method) {
    case 'initialize':
      return rpc(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'flatr', version: '1.0.0' },
        instructions: 'Verktøy for å lese og endre én Flatr-presentasjon (infoskjerm).'
      });
    case 'ping':
      return rpc(id, {});
    case 'tools/list':
      return rpc(id, { tools: run.defs.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) });
    case 'tools/call': {
      const name = params?.name;
      if (!run.defs.some((t) => t.name === name)) return rpcError(id, -32602, `Ukjent verktøy ${name}`);
      try {
        const out = await run.call(name, params?.arguments || {});
        if (out?.__image) {
          return rpc(id, {
            content: [
              { type: 'image', data: out.__image, mimeType: 'image/jpeg' },
              { type: 'text', text: out.note || '' }
            ]
          });
        }
        return rpc(id, { content: [{ type: 'text', text: JSON.stringify(out ?? { ok: true }) }] });
      } catch (err) {
        return rpc(id, { content: [{ type: 'text', text: String(err?.message || err) }], isError: true });
      }
    }
    default:
      return rpcError(id, -32601, `Ukjent metode ${method}`);
  }
}

export async function onRequestPost({ request }) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const run = runFor(token);
  if (!run) return json(rpcError(null, -32001, 'Ingen pågående Flatr-oppgave for denne nøkkelen'), { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(rpcError(null, -32700, 'Ugyldig JSON'), { status: 400 });
  }
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map((m) => handle(m, run)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return json(batch ? replies : replies[0]);
}

// Ingen strøm fra serveren til klienten (GET), og ingen økter å avslutte (DELETE).
export const onRequestGet = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });
export const onRequestDelete = () => noContent();
export const onRequestOptions = handleOptions;
