// Samarbeids-rom på Node. Gjenbruker DeckRoom (src/collab/DeckRoom.js) uendret
// ved å gi den det lille utsnittet av Durable Object-API-et den bruker:
//   ctx.acceptWebSocket(ws), ctx.getWebSockets(),
//   ws.send / ws.close / ws.serializeAttachment / ws.deserializeAttachment.
//
// Ett rom pr. (kunde, rom-navn), så kunder aldri ser hverandres tilstedeværelse.

import { WebSocketServer } from 'ws';
import { DeckRoom } from '../src/collab/DeckRoom.js';

class RoomContext {
  constructor() {
    this.sockets = new Set();
  }
  acceptWebSocket(ws) {
    this.sockets.add(ws);
  }
  getWebSockets() {
    return [...this.sockets];
  }
}

// Pakker inn en `ws`-socket med attachment-metodene fra Hibernation-API-et.
function wrap(raw) {
  let attachment = null;
  return {
    raw,
    send: (data) => raw.send(data),
    close: () => raw.close(),
    serializeAttachment: (v) => {
      attachment = structuredClone(v);
    },
    deserializeAttachment: () => attachment
  };
}

const rooms = new Map(); // key -> { ctx, room }

function getRoom(key) {
  let entry = rooms.get(key);
  if (!entry) {
    const ctx = new RoomContext();
    entry = { ctx, room: new DeckRoom(ctx, {}) };
    rooms.set(key, entry);
  }
  return entry;
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

/**
 * Håndterer en HTTP upgrade til /api/collab/<rom>. `identity` er allerede
 * autentisert av kalleren ({ name, color, sub }).
 */
export function handleCollabUpgrade(req, socket, head, { roomKey, identity }) {
  wss.handleUpgrade(req, socket, head, (raw) => {
    const { ctx, room } = getRoom(roomKey);
    const ws = wrap(raw);

    // Samme oppsett som DeckRoom.fetch gjør etter acceptWebSocket.
    ctx.acceptWebSocket(ws);
    ws.serializeAttachment({
      id: crypto.randomUUID(),
      name: identity.name,
      color: identity.color,
      sub: identity.sub,
      slide: null,
      el: null
    });
    room.broadcastPresence();

    raw.on('message', (data) => room.webSocketMessage(ws, data.toString()));
    raw.on('close', () => {
      ctx.sockets.delete(ws);
      room.webSocketClose(ws);
      if (ctx.sockets.size === 0) rooms.delete(roomKey);
    });
    raw.on('error', () => {
      ctx.sockets.delete(ws);
      room.webSocketError(ws);
    });
  });
}
