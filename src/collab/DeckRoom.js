// Durable Object: ett samarbeids-«rom» pr. kanal (screen_id).
//
// Relaystasjon for WebSocket-tilkoblinger fra kanal-editoren:
//   - tilstedeværelse: hvem er inne, hvilket lysbilde de ser på, hvilket
//     element de har markert
//   - live markører (throttlet, relayes direkte)
//   - live operasjoner (`op`) – create/update/delete/reorder – relayes til peers
//
// Ingen lagring: alt ligger i de tilkoblede socketenes attachment. Bruker
// WebSocket Hibernation-API-et, så idle-tilkoblinger nesten ikke koster noe.

export class DeckRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('forventet websocket', { status: 426 });
    }
    const url = new URL(request.url);
    const identity = {
      id: crypto.randomUUID(),
      name: url.searchParams.get('name') || 'bruker',
      color: url.searchParams.get('color') || '#8b8d94',
      sub: url.searchParams.get('sub') || 'anon'
    };

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ ...identity, slide: null, el: null });
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  peers() {
    return this.ctx.getWebSockets().map((ws) => {
      const a = ws.deserializeAttachment() || {};
      return {
        id: a.id,
        name: a.name,
        color: a.color,
        slide: a.slide ?? null,
        el: a.el ?? null
      };
    });
  }

  broadcastPresence() {
    const peers = this.peers();
    for (const ws of this.ctx.getWebSockets()) {
      const you = (ws.deserializeAttachment() || {}).id;
      try {
        ws.send(JSON.stringify({ t: 'presence', peers, you }));
      } catch {
        /* socket på vei ned */
      }
    }
  }

  relay(fromWs, payload) {
    const msg = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === fromWs) continue;
      try {
        ws.send(msg);
      } catch {
        /* ignore */
      }
    }
  }

  webSocketMessage(ws, raw) {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const a = ws.deserializeAttachment() || {};

    switch (m.t) {
      case 'focus':
        ws.serializeAttachment({ ...a, slide: m.slide ?? null, el: null });
        this.broadcastPresence();
        break;
      case 'select':
        ws.serializeAttachment({ ...a, el: m.el ?? null });
        this.broadcastPresence();
        break;
      case 'cursor':
        this.relay(ws, { t: 'cursor', id: a.id, slide: m.slide ?? null, x: m.x, y: m.y });
        break;
      case 'op':
        if (m.op) this.relay(ws, { t: 'op', from: a.id, op: m.op });
        break;
      default:
        break;
    }
  }

  webSocketClose(ws) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    this.broadcastPresence();
  }

  webSocketError(ws) {
    this.broadcastPresence();
  }
}
