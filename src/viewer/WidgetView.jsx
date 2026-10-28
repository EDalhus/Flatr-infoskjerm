import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ElementView from './ElementView.jsx';

// /widget/:elementId – én widget i hele vinduet. Brukes av serveren til å ta
// skjermbilder av vær/nyheter/kalender for Apple TV (som ikke kan vise dem selv).
// Bakgrunnen er gjennomsiktig (PNG), så TV-en viser lysbildet bak widgeten.
// ?scale=2 tegner widgeten med samme oppsett, men i dobbel oppløsning (4K-TV-er).

export default function WidgetView() {
  const { elementId } = useParams();
  const [el, setEl] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const scale = Math.min(3, Math.max(1, Number(new URLSearchParams(window.location.search).get('scale')) || 1));

  // Gjennomsiktig side: html/body har ellers admin-bakgrunnen.
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  useEffect(() => {
    fetch(`/api/feeds?element=${encodeURIComponent(elementId)}&describe=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setEl)
      .catch(() => setEl(null));
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [elementId]);

  return (
    <div
      className="viewer-root overflow-hidden"
      style={{ width: `${100 / scale}vw`, height: `${100 / scale}vh`, zoom: scale, background: 'transparent' }}
    >
      {el && <ElementView element={{ id: el.id, kind: el.kind, config: el.config }} ctx={{ now, schedule: [], sponsors: [], categories: [] }} />}
    </div>
  );
}
