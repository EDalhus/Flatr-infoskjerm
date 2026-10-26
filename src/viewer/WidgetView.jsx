import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ElementView from './ElementView.jsx';

// /widget/:elementId – én widget i hele vinduet. Brukes av serveren til å ta
// skjermbilder av vær/nyheter/kalender for Apple TV (som ikke kan vise dem selv).

function backgroundCss(bg) {
  if (!bg) return '#000000';
  if (bg.type === 'color') return bg.color || '#000000';
  if (bg.type === 'gradient') return `linear-gradient(${bg.angle ?? 135}deg, ${bg.from}, ${bg.to})`;
  if (bg.type === 'dynamic' && bg.colors?.length) return `linear-gradient(135deg, ${bg.colors.join(', ')})`;
  return '#000000';
}

export default function WidgetView() {
  const { elementId } = useParams();
  const [el, setEl] = useState(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    fetch(`/api/feeds?element=${encodeURIComponent(elementId)}&describe=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setEl)
      .catch(() => setEl(null));
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [elementId]);

  return (
    <div className="viewer-root h-screen w-screen overflow-hidden" style={{ background: backgroundCss(el?.background) }}>
      {el && <ElementView element={{ id: el.id, kind: el.kind, config: el.config }} ctx={{ now, schedule: [], sponsors: [], categories: [] }} />}
    </div>
  );
}
