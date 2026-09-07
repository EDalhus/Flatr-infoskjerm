import { useCallback, useEffect, useRef, useState } from 'react';

// Samarbeids-tilkobling for kanal-editoren.
// Kobler til /api/collab/<screenId> (Durable Object), holder oversikt over
// andre brukere (peers) og relayer fokus / markering / markør / operasjoner.
//
//   const { peers, connected, selfId, setFocus, setSelect, sendCursor, sendOp }
//     = useCollab(room, { onOp, where });
// `room` = kanal-id (tall) for editoren, eller "lobby" for global tilstedeværelse.
// `where` = valgfri etikett (hvilken side brukeren er på) som deles i lobbyen.
export function useCollab(room, { onOp, where } = {}) {
  const [peers, setPeers] = useState([]);
  const [connected, setConnected] = useState(false);
  const [selfId, setSelfId] = useState(null);

  const wsRef = useRef(null);
  const mineRef = useRef({ slide: null, el: null, where: where ?? null });
  const onOpRef = useRef(onOp);
  onOpRef.current = onOp;

  useEffect(() => {
    if (!room || typeof window === 'undefined') return undefined;
    let stopped = false;
    let attempt = 0;
    let timer = null;
    let ws = null;

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      // ?as=<navn> på siden forwardes for lokal fler-bruker-testing (ignoreres i prod).
      const as = new URLSearchParams(window.location.search).get('as');
      const q = as ? `?as=${encodeURIComponent(as)}` : '';
      ws = new WebSocket(`${proto}://${window.location.host}/api/collab/${room}${q}`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        const m = mineRef.current;
        ws.send(JSON.stringify({ t: 'focus', slide: m.slide ?? null }));
        if (m.el != null) ws.send(JSON.stringify({ t: 'select', el: m.el }));
        if (m.where != null) ws.send(JSON.stringify({ t: 'where', where: m.where }));
      };

      ws.onmessage = (e) => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.t === 'presence') {
          setPeers(msg.peers || []);
          if (msg.you) setSelfId(msg.you);
        } else if (msg.t === 'cursor') {
          setPeers((prev) =>
            prev.map((p) =>
              p.id === msg.id ? { ...p, cursor: { slide: msg.slide, x: msg.x, y: msg.y } } : p
            )
          );
        } else if (msg.t === 'op') {
          onOpRef.current?.(msg.op, msg.from);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (wsRef.current === ws) wsRef.current = null;
        if (stopped) return;
        attempt = Math.min(attempt + 1, 6);
        timer = setTimeout(connect, 400 * 2 ** attempt + Math.random() * 400);
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      wsRef.current = null;
    };
  }, [room]);

  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }, []);

  const setFocus = useCallback(
    (slide) => {
      mineRef.current = { ...mineRef.current, slide: slide ?? null, el: null };
      send({ t: 'focus', slide: slide ?? null });
    },
    [send]
  );
  const setSelect = useCallback(
    (el) => {
      mineRef.current.el = el ?? null;
      send({ t: 'select', el: el ?? null });
    },
    [send]
  );
  const setWhere = useCallback(
    (label) => {
      mineRef.current.where = label ?? null;
      send({ t: 'where', where: label ?? null });
    },
    [send]
  );
  const sendCursor = useCallback((slide, x, y) => send({ t: 'cursor', slide, x, y }), [send]);
  const sendOp = useCallback((op) => send({ t: 'op', op }), [send]);

  // Hold `where` synk når prop-en endrer seg.
  useEffect(() => {
    if (where !== undefined) setWhere(where);
  }, [where, setWhere]);

  return { peers, connected, selfId, setFocus, setSelect, setWhere, sendCursor, sendOp };
}
