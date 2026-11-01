// flatr.no/tv: koble en skjerm med nettleser (smart-TV, Raspberry Pi, PC) eller
// Android TV-appen til Flatr med kode, som Apple TV. Siden ber om en kode, viser
// den med QR-kode og spør jevnlig om noen har koblet den. Da går den til
// skjermvisningen hos kunden, som fortsetter å melde seg (src/viewer/device.js).
// Har nettleseren vært koblet før (f.eks. etter strømbrudd), går den rett dit.

import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { LogoLockup } from '../admin/components/Logo.jsx';

const KEY = 'flatr.tv'; // { device_id } i denne nettleseren

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
};
const write = (v) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* privat modus */
  }
};

/** Det admin viser om enheten. Android TV-appen legger på ?app=android&v=&model=&os=. */
function clientInfo() {
  const p = new URLSearchParams(window.location.search);
  const android = p.get('app') === 'android';
  return {
    app_version: android ? `Android TV-app ${p.get('v') || ''}`.trim() : 'Nettleser',
    player_version: 'web',
    model: (p.get('model') || '').slice(0, 60) || undefined,
    os_version: (p.get('os') || '').slice(0, 60) || undefined,
    resolution: `${Math.round(window.screen.width * (window.devicePixelRatio || 1))}x${Math.round(window.screen.height * (window.devicePixelRatio || 1))}`
  };
}

/** Skjermvisningen hos kunden. Enhets-id-en følger med i #, så den ikke havner i logger. */
const displayUrl = (deviceId, st) => `${st.display_origin}${st.display_url}#device=${encodeURIComponent(deviceId)}`;

export default function TvPair() {
  const [pairing, setPairing] = useState(null); // svar fra /api/pairing/request
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    document.title = 'Koble til Flatr';
    document.documentElement.style.background = '#0b1110';
    let alive = true;
    let timer = null;
    const later = (fn, ms) => {
      clearTimeout(timer);
      if (alive) timer = setTimeout(fn, ms);
    };

    const status = async (deviceId) => {
      const res = await fetch(`/api/pairing/status/${encodeURIComponent(deviceId)}`, { cache: 'no-store' });
      return res.json().catch(() => ({ status: 'unknown' }));
    };

    const open = (deviceId, st) => {
      if (!st.display_origin) return false;
      write({ device_id: deviceId });
      window.location.replace(displayUrl(deviceId, st));
      return true;
    };

    const poll = async (deviceId) => {
      try {
        const st = await status(deviceId);
        if (!alive) return;
        setOffline(false);
        if (st.status === 'paired' && open(deviceId, st)) return;
        if (st.status === 'pending') return later(() => poll(deviceId), (st.poll_interval_seconds || 3) * 1000);
        start(true); // utløpt eller ukjent: ny kode
      } catch {
        setOffline(true);
        later(() => poll(deviceId), 10_000);
      }
    };

    const start = async (fresh = false) => {
      try {
        // Koblet før? Da rett til skjermen.
        const saved = !fresh && read();
        if (saved?.device_id) {
          const st = await status(saved.device_id);
          if (!alive) return;
          if (st.status === 'paired' && open(saved.device_id, st)) return;
          if (st.status === 'pending') {
            setPairing({ device_id: saved.device_id, ...st });
            return poll(saved.device_id);
          }
        }
        const res = await fetch('/api/pairing/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clientInfo())
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || 'Feil');
        if (!alive) return;
        write({ device_id: body.device_id });
        setOffline(false);
        setPairing(body);
        later(() => poll(body.device_id), (body.poll_interval_seconds || 3) * 1000);
      } catch {
        if (!alive) return;
        setOffline(true);
        later(() => start(fresh), 10_000);
      }
    };

    start();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const qr = useMemo(() => {
    if (!pairing?.pair_url) return '';
    try {
      const q = qrcode(0, 'M');
      q.addData(pairing.pair_url);
      q.make();
      return q.createDataURL(8, 2);
    } catch {
      return '';
    }
  }, [pairing?.pair_url]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#0b1110] p-[5vmin] text-white">
      <LogoLockup className="h-[5vmin] w-auto text-white" />
      {pairing ? (
        <div className="mt-[6vmin] flex flex-wrap items-center justify-center gap-[7vmin]">
          <div className="text-center">
            <div className="text-[2.6vmin] font-semibold uppercase tracking-[0.25em] text-[#7ee2b8]">Koden til denne skjermen</div>
            <div className="mt-[1.5vmin] font-mono text-[13vmin] font-bold leading-none tracking-[0.08em]">{pairing.code_display}</div>
            <ol className="m-0 mt-[4vmin] list-none space-y-[1.2vmin] p-0 text-left text-[2.8vmin] text-white/80">
              <li>1. Logg inn i Flatr på PC-en eller mobilen</li>
              <li>2. Gå til Skjermer og trykk «Legg til skjerm»</li>
              <li>3. Tast inn koden over</li>
            </ol>
          </div>
          {qr && (
            <div className="text-center">
              <img src={qr} alt="" className="h-[34vmin] w-[34vmin] rounded-[2vmin] bg-white p-[1.2vmin]" style={{ imageRendering: 'pixelated' }} />
              <div className="mt-[1.5vmin] text-[2.4vmin] text-white/70">Eller skann med mobilen</div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-[6vmin] text-[3vmin] text-white/70">{offline ? 'Ingen forbindelse – prøver igjen …' : 'Henter kode …'}</div>
      )}
      {pairing && offline && <div className="mt-[4vmin] text-[2.4vmin] text-[#fbbf24]">Ingen forbindelse – prøver igjen …</div>}
    </div>
  );
}
