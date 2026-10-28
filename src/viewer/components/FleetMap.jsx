import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { NAUTICAL, nauticalTile } from './nauticalTiles.js';
import { Icon } from '../../admin/components/ui.jsx';
import { hasPosition, isMoving, vesselColor, shipClass, SHIP_CLASSES } from '../../lib/ais.js';
import LANDMASK from '../../lib/landmask.json';

// Kart med flåten (og kaiene) på Kartverkets kart. Ingen kartbibliotek:
// Web Mercator-matte, fliser som <img> og markører oppå. Zoomen er brøkdel,
// så utsnittet passer flaten nøyaktig – flisene skaleres fra nærmeste hele nivå.
//
// area: 'fleet' (zoom til båtene/kaiene) | 'norway' (hele kysten).
// onPick(lat, lon): klikk i kartet (brukes til å plassere kaier i admin).
// interactive: zoom (hjul/knapper) og flytt (dra) – bare i admin; skjermene er statiske.
// focus: { lat, lon, zoom } – hopp dit (f.eks. etter stedssøk).
// mapStyle: 'nautical' (Kartverkets sjøkart farget mørkt, som Kystverkets kart) | 'light' (gråtonekart).
// colorBy: 'type' (farge etter skipsklasse) | 'own' (flåtens egne farger). legend: vis fargeforklaring.

const TILE = 256;
const LAYER = { nautical: 'topo', light: 'topograatone' };
const TILE_URL = (layer, z, x, y) => `https://cache.kartverket.no/v1/wmts/1.0.0/${layer}/default/webmercator/${z}/${y}/${x}.png`;

// Mørkt kart (som Kystverkets): flisene fargelegges én gang og mellomlagres i
// nauticalTiles.js. Utenfor Kartverkets dekning (havet langt ute, nabolandene)
// er de gjennomsiktige; der viser en enkel landmaske fra Natural Earth
// (src/lib/landmask.json) land og sjø.
const rgb = (c) => `rgb(${c.join(',')})`;

/** Én mørk kartflis – vises når den er ferdig fargelagt. */
function DarkTile({ src, style }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    nauticalTile(src).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [src]);
  if (!url) return null;
  return <img src={url} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none" style={style} />;
}

// Stedsnavn på det mørke kartet (Kartverkets egne navn forsvinner i filteret).
// [navn, lat, lon, minste zoom]
const PLACES = [
  ['Oslo', 59.91, 10.75, 3], ['Bergen', 60.39, 5.32, 3], ['Trondheim', 63.43, 10.39, 3], ['Stavanger', 58.97, 5.73, 5],
  ['Tromsø', 69.65, 18.96, 3], ['Bodø', 67.28, 14.4, 5], ['Ålesund', 62.47, 6.15, 6], ['Kristiansand', 58.15, 8.0, 6],
  ['Hammerfest', 70.66, 23.68, 6], ['Kirkenes', 69.73, 30.05, 6], ['Molde', 62.74, 7.16, 7], ['Kristiansund', 63.11, 7.73, 7],
  ['Haugesund', 59.41, 5.27, 7], ['Florø', 61.6, 5.03, 7], ['Narvik', 68.44, 17.43, 7], ['Harstad', 68.8, 16.54, 7],
  ['Svolvær', 68.23, 14.57, 7], ['Rørvik', 64.86, 11.24, 8], ['Brønnøysund', 65.47, 12.21, 8], ['Sandnessjøen', 66.02, 12.63, 8],
  ['Mo i Rana', 66.31, 14.14, 8], ['Måløy', 61.94, 5.11, 8], ['Egersund', 58.45, 6.0, 8], ['Arendal', 58.46, 8.77, 8],
  ['Fredrikstad', 59.22, 10.93, 8], ['Tønsberg', 59.27, 10.41, 8], ['Vardø', 70.37, 31.11, 8], ['Honningsvåg', 70.98, 25.97, 8],
  ['Ulsteinvik', 62.34, 5.85, 9], ['Fosnavåg', 62.34, 5.63, 9], ['Brattvåg', 62.6, 6.44, 9], ['Volda', 62.15, 6.07, 9],
  ['Ørsta', 62.2, 6.13, 9], ['Hareid', 62.37, 6.03, 10], ['Langevåg', 62.44, 6.2, 10], ['Spjelkavik', 62.46, 6.38, 10],
  ['Vigra', 62.56, 6.08, 10], ['Godøy', 62.5, 6.0, 10]
];
const PLACE_SCALE = { 3: 1.1, 4: 1.15, 5: 1.25, 6: 1.15, 7: 1.05 };

const NORWAY = { minLat: 57.7, maxLat: 71.3, minLon: 3.5, maxLon: 31.5 };
const MAX_ZOOM = 13; // automatisk utsnitt
const MAX_TILE_ZOOM = 18; // Kartverket har fliser hit
const MIN_ZOOM = 3;
const MIN_SPAN = 0.06; // grader – én båt alene skal ikke gi gatenivå

const worldX = (lon, z) => ((lon + 180) / 360) * TILE * 2 ** z;
const worldY = (lat, z) => {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
};
const lonAt = (x, z) => (x / (TILE * 2 ** z)) * 360 - 180;
const latAt = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};

function boundsFor(points, area) {
  if (area === 'norway' || !points.length) return NORWAY;
  let b = { minLat: 90, maxLat: -90, minLon: 180, maxLon: -180 };
  for (const p of points) {
    b = { minLat: Math.min(b.minLat, p.lat), maxLat: Math.max(b.maxLat, p.lat), minLon: Math.min(b.minLon, p.lon), maxLon: Math.max(b.maxLon, p.lon) };
  }
  const padLat = Math.max(MIN_SPAN - (b.maxLat - b.minLat), 0) / 2;
  const padLon = Math.max(MIN_SPAN * 2 - (b.maxLon - b.minLon), 0) / 2;
  return { minLat: b.minLat - padLat, maxLat: b.maxLat + padLat, minLon: b.minLon - padLon, maxLon: b.maxLon + padLon };
}

/** Brøk-zoom og senter som får bounds til å fylle w×h (med marg). */
function fit(bounds, w, h, margin) {
  const z0 = 0;
  const bw = worldX(bounds.maxLon, z0) - worldX(bounds.minLon, z0);
  const bh = worldY(bounds.minLat, z0) - worldY(bounds.maxLat, z0);
  const zx = Math.log2(Math.max(1, w - margin * 2) / Math.max(bw, 1e-9));
  const zy = Math.log2(Math.max(1, h - margin * 2) / Math.max(bh, 1e-9));
  const zoom = Math.max(2, Math.min(MAX_ZOOM, zx, zy));
  const cx = (worldX(bounds.minLon, zoom) + worldX(bounds.maxLon, zoom)) / 2;
  const cy = (worldY(bounds.minLat, zoom) + worldY(bounds.maxLat, zoom)) / 2;
  return { zoom, left: cx - w / 2, top: cy - h / 2 };
}

// Måles på flere måter: nettleseren som tar skjermbilder for Apple TV kjører
// siden i bakgrunnen, der ResizeObserver ikke alltid får med seg at vinduet
// har fått riktig størrelse.
function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    const timers = [250, 1000, 2500].map((ms) => setTimeout(measure, ms));
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      timers.forEach(clearTimeout);
    };
  }, [ref]);
  return size;
}

/**
 * Båtsymbol som på Kystverkets kart: et skrog med spiss baug, dreid etter
 * kurs, med en hvit fartsvektor foran når båten er i fart. Uten kurs: prikk.
 */
function Vessel({ v, x, y, size, labels, color, dark, vectorPx }) {
  const moving = isMoving(v);
  const angle = v.heading ?? v.cog;
  const hasAngle = angle != null && (moving || v.heading != null);
  return (
    <div className="pointer-events-none absolute" style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}>
      <svg width={size} height={size} viewBox="-12 -12 24 24" style={{ overflow: 'visible', display: 'block' }}>
        {hasAngle ? (
          <g transform={`rotate(${angle})`}>
            {moving && vectorPx > 0 && <line x1="0" y1="-12" x2="0" y2={-12 - vectorPx} stroke={dark ? '#e5e7eb' : '#334155'} strokeWidth="1.2" />}
            <path d="M0,-12 L5,-5 L5,11 L-5,11 L-5,-5 Z" fill={color} stroke={dark ? '#0b1630' : '#ffffff'} strokeWidth="1.4" strokeLinejoin="round" />
            <rect x="-2.2" y="3" width="4.4" height="5" rx="0.6" fill="#ffffff" />
          </g>
        ) : (
          <circle r="5.5" fill={color} stroke={dark ? '#0b1630' : '#ffffff'} strokeWidth="1.6" />
        )}
      </svg>
      {labels && (
        <div
          className="absolute left-1/2 whitespace-nowrap rounded px-[0.45em] py-[0.1em] font-semibold text-white"
          style={{ top: '100%', transform: 'translate(-50%, 2px)', background: dark ? 'rgba(2,6,23,0.72)' : 'rgba(15,23,42,0.82)', fontSize: Math.max(10, size * 0.4) }}
        >
          {v.name}
        </div>
      )}
    </div>
  );
}

function Legend({ classes, size }) {
  if (!classes.length) return null;
  return (
    <div
      className="pointer-events-none absolute bottom-[1.6em] left-2 flex max-w-[60%] flex-wrap gap-x-[0.8em] gap-y-[0.3em] rounded-md px-[0.6em] py-[0.4em] text-white"
      style={{ background: 'rgba(2,6,23,0.7)', fontSize: Math.max(10, size * 0.38) }}
    >
      {classes.map((c) => (
        <span key={c.id} className="flex items-center gap-[0.35em] whitespace-nowrap">
          <span className="inline-block h-[0.75em] w-[0.75em] rounded-sm" style={{ background: c.color }} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

function FleetMap({
  vessels = [],
  quays = [],
  area = 'fleet',
  labels = true,
  onPick,
  highlightQuayId,
  interactive = false,
  focus,
  mapStyle = 'nautical',
  colorBy = 'type',
  legend = false,
  attribution = '© Kartverket · AIS: Kystverket/BarentsWatch'
}) {
  const dark = mapStyle !== 'light';
  const layer = LAYER[mapStyle] || LAYER.nautical;
  const ref = useRef(null);
  const { w, h } = useSize(ref);
  const placed = vessels.filter(hasPosition);
  const points = [...placed, ...quays.filter(hasPosition)];
  // Bounds endres bare når posisjonene faktisk flytter seg merkbart.
  const boundsKey = points.map((p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`).join('|') + area;
  const [view, setView] = useState(null);
  // Når brukeren har zoomet/flyttet selv, overstyres ikke utsnittet av nye posisjoner.
  const userMoved = useRef(false);
  const drag = useRef(null);

  useEffect(() => {
    if (!w || !h) return;
    if (interactive && userMoved.current && view) return;
    setView(fit(boundsFor(points, area), w, h, Math.min(w, h) * 0.12));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, w, h]);

  useEffect(() => {
    if (!focus || !w || !h) return;
    const zoom = focus.zoom ?? 14;
    userMoved.current = true;
    setView({ zoom, left: worldX(focus.lon, zoom) - w / 2, top: worldY(focus.lat, zoom) - h / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, w, h]);

  /** Zoom med dz rundt punktet (cx, cy) i kartet – punktet blir liggende i ro. */
  const zoomAt = (dz, cx = w / 2, cy = h / 2) =>
    setView((v) => {
      if (!v) return v;
      const zoom = Math.min(MAX_TILE_ZOOM, Math.max(MIN_ZOOM, v.zoom + dz));
      const k = 2 ** (zoom - v.zoom);
      userMoved.current = true;
      return { zoom, left: (v.left + cx) * k - cx, top: (v.top + cy) * k - cy };
    });

  // Hjul/styreflate. Må være ikke-passiv for å hindre at siden scroller.
  useEffect(() => {
    const el = ref.current;
    if (!interactive || !el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(-e.deltaY * (e.ctrlKey ? 0.01 : 0.003), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, w, h]);

  // Markørstørrelse: tydelig på en TV, men ikke dominerende.
  const marker = Math.min(34, Math.max(14, Math.min(w, h) * 0.035));
  // Fliser for ett zoomnivå som dekker utsnittet.
  const tilesAt = (z) => {
    const out = [];
    const scale = 2 ** (view.zoom - z);
    const ts = TILE * scale;
    const max = 2 ** z;
    const x0 = Math.floor(view.left / ts);
    const y0 = Math.floor(view.top / ts);
    const x1 = Math.floor((view.left + w) / ts);
    const y1 = Math.floor((view.top + h) / ts);
    for (let ty = Math.max(0, y0); ty <= Math.min(max - 1, y1); ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const wx = ((tx % max) + max) % max;
        out.push({ key: `${layer}/${z}/${tx}/${ty}`, src: TILE_URL(layer, z, wx, ty), left: tx * ts - view.left, top: ty * ts - view.top, size: ts });
      }
    }
    return out;
  };
  let tiles = [];
  if (view) {
    // Mørkt kart: ett nivå dypere enn nødvendig og skalert ned – skarpere kystlinje
    // (Kartverkets grove nivåer er sterkt generalisert og blir taggete når de forstørres).
    const z = Math.min(MAX_TILE_ZOOM, Math.floor(view.zoom) + (dark ? 1 : 0));
    tiles = tilesAt(z);
  }

  const pick = (e) => {
    if (!onPick || !view) return;
    const r = ref.current.getBoundingClientRect();
    onPick(latAt(view.top + (e.clientY - r.top), view.zoom), lonAt(view.left + (e.clientX - r.left), view.zoom));
  };

  // Dra for å flytte. Et klikk uten bevegelse er et valg (onPick).
  const pointer = interactive
    ? {
        onPointerDown: (e) => {
          if (e.button !== 0 || e.target.closest('button')) return;
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        },
        onPointerMove: (e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) < 4) return;
          d.moved = true;
          d.x = e.clientX;
          d.y = e.clientY;
          userMoved.current = true;
          setView((v) => v && { ...v, left: v.left - dx, top: v.top - dy });
        },
        onPointerUp: (e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) pick(e);
        },
        onPointerCancel: () => (drag.current = null)
      }
    : { onClick: pick };

  const pos = (p) => ({ x: worldX(p.lon, view.zoom) - view.left, y: worldY(p.lat, view.zoom) - view.top });

  // Landmasken (utenfor Kartverkets dekning) som én SVG-sti i skjermkoordinater.
  const landPath = useMemo(() => {
    if (!dark || !view) return '';
    let d = '';
    for (const ring of LANDMASK.rings) {
      ring.forEach(([lon, lat], i) => {
        d += `${i ? 'L' : 'M'}${(worldX(lon, view.zoom) - view.left).toFixed(1)},${(worldY(lat, view.zoom) - view.top).toFixed(1)}`;
      });
      d += 'Z';
    }
    return d;
  }, [dark, view]);

  // Stedsnavn som ville kollidert med en båt eller kai (med navnelapp) hoppes over.
  const occupied = view ? [...placed, ...quays.filter(hasPosition)].map((p) => pos(p)) : [];
  const places =
    dark && view
      ? PLACES.filter(([, lat, lon, minZ]) => {
          if (view.zoom < minZ) return false;
          const { x, y } = pos({ lat, lon });
          return !occupied.some((o) => Math.abs(o.x - x) < marker * 3.5 && Math.abs(o.y - y) < marker * 1.8);
        })
      : [];

  // Fartsvektor: distansen båten går på 6 minutter, i symbolets koordinater (24 = markørstørrelsen).
  const vectorUnits = (v) => {
    if (!view || !isMoving(v)) return 0;
    const metersPerPx = (40075016 * Math.cos((v.lat * Math.PI) / 180)) / (TILE * 2 ** view.zoom);
    const px = (Number(v.sog) * 0.1 * 1852) / metersPerPx;
    return Math.min(80, (px * 24) / marker);
  };
  const classes = legend && colorBy !== 'own' ? SHIP_CLASSES.filter((c) => placed.some((v) => shipClass(v.shipType).id === c.id)) : [];


  return (
    <div
      ref={ref}
      className={`relative h-full w-full select-none overflow-hidden ${onPick ? 'cursor-crosshair' : interactive ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ background: dark ? rgb(NAUTICAL.sea) : '#e8ebee', touchAction: interactive ? 'none' : undefined }}
      {...pointer}
    >
      {dark && view && (
        <svg className="pointer-events-none absolute inset-0" width={w} height={h} aria-hidden="true">
          <path d={landPath} fill={rgb(NAUTICAL.land)} />
        </svg>
      )}
      <div className="pointer-events-none absolute inset-0">
        {tiles.map((t) => {
          const style = { left: t.left, top: t.top, width: t.size + 0.5, height: t.size + 0.5 };
          return dark ? (
            <DarkTile key={t.key} src={t.src} style={style} />
          ) : (
            <img key={t.key} src={t.src} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none" style={style} />
          );
        })}
      </div>
      {places.map(([name, lat, lon]) => {
        const { x, y } = pos({ lat, lon });
        if (x < -80 || y < -20 || x > w + 80 || y > h + 20) return null;
        return (
          <div
            key={name}
            className="pointer-events-none absolute whitespace-nowrap font-semibold"
            style={{
              left: x,
              top: y,
              transform: 'translate(-50%, -50%)',
              color: '#e2e8f0',
              fontSize: Math.max(10, marker * 0.5) * (PLACE_SCALE[Math.floor(view.zoom)] || 1),
              textShadow: '0 0 4px #0b1630, 0 0 2px #0b1630',
              opacity: 0.85
            }}
          >
            {name}
          </div>
        );
      })}
      {view &&
        quays.filter(hasPosition).map((q) => {
          const { x, y } = pos(q);
          const hl = q.id === highlightQuayId;
          return (
            <div key={q.id} className="pointer-events-none absolute" style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}>
              <div
                className="rounded-sm border-2"
                style={{ width: marker * 0.45, height: marker * 0.45, background: hl ? '#f8fafc' : dark ? '#94a3b8' : '#475569', borderColor: dark ? '#0b1630' : '#ffffff' }}
              />
              {labels && (
                <div
                  className="absolute left-1/2 whitespace-nowrap font-semibold"
                  style={{ bottom: '100%', transform: 'translate(-50%, -2px)', color: dark ? '#f1f5f9' : '#111827', fontSize: Math.max(9, marker * 0.42), textShadow: dark ? '0 0 3px #0b1630, 0 0 3px #0b1630' : '0 0 3px #fff, 0 0 3px #fff' }}
                >
                  {q.name}
                </div>
              )}
            </div>
          );
        })}
      {view &&
        placed.map((v) => {
          const { x, y } = pos(v);
          return (
            <Vessel key={v.mmsi} v={v} x={x} y={y} size={marker} labels={labels} color={vesselColor(v, colorBy)} dark={dark} vectorPx={vectorUnits(v)} />
          );
        })}
      <Legend classes={classes} size={marker} />
      {interactive && (
        <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow">
          {[
            ['plus', 'Zoom inn', 1],
            ['minus', 'Zoom ut', -1]
          ].map(([icon, label, dz]) => (
            <button
              key={icon}
              type="button"
              aria-label={label}
              title={label}
              onClick={() => zoomAt(dz)}
              className="grid h-8 w-8 place-items-center text-lg font-bold text-slate-700 hover:bg-slate-100"
            >
              {icon === 'plus' ? <Icon name="plus" className="h-4 w-4" /> : <span className="block h-0.5 w-3.5 rounded bg-slate-700" />}
            </button>
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-0 right-0 bg-white/70 px-1.5 py-0.5 text-[10px] text-slate-700">
        {attribution}
      </div>
    </div>
  );
}

// Kartet tegnes ikke på nytt når noe annet på lerretet endres (editoren).
export default memo(FleetMap);
