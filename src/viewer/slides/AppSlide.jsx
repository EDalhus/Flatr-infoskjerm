import { useEffect, useMemo, useState } from 'react';
import { useFeed, FeedMessage } from './useFeed.jsx';
import FleetMap from '../components/FleetMap.jsx';
import CustomAppView from './CustomAppView.jsx';
import BirthdayView, { inWindow } from './BirthdayView.jsx';
import CakeRain from './CakeRain.jsx';
import MenuView from './MenuView.jsx';
import TidesView from './TidesView.jsx';
import FootballView from './FootballView.jsx';
import { statusLabel, etaTo, etaText, ago, hasPosition, isMoving, vesselColor } from '../../lib/ais.js';
import { currentCalls, cargoLine, callTimeText, callDate, hasClock } from '../../lib/portCalls.js';

// Flatr App – viser data fra en app kunden har satt opp under «Flatr Apps».
// AIS: view = 'map' (kart), 'cards' (båtkort) eller 'arrivals' (ankomsttavle).

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const knots = (v) => (v.sog == null ? '–' : `${v.sog.toFixed(1).replace('.', ',')} kn`);

function VesselCard({ v, quay, now }) {
  const e = quay ? etaTo(v, quay, now) : null;
  return (
    <div className="flex min-h-0 flex-col gap-[0.35em] overflow-hidden rounded-[0.6em] p-[0.8em] [&>*]:shrink-0" style={{ background: 'rgba(0,0,0,0.32)', borderLeft: `0.3em solid ${v.color}` }}>
      <div className="truncate pb-[0.1em] font-bold leading-snug" style={{ fontSize: '1.35em' }}>
        {v.name}
      </div>
      <div className="flex items-center gap-[0.4em] opacity-90">
        <span className="inline-block h-[0.6em] w-[0.6em] rounded-full" style={{ background: v.missing ? '#9ca3af' : isMoving(v) ? '#22c55e' : '#f59e0b' }} />
        {statusLabel(v)}
        {!v.missing && <span className="ml-auto tabular-nums">{knots(v)}</span>}
      </div>
      {!v.missing && v.destination && <div className="truncate opacity-75">→ {v.destination}</div>}
      {e && e.state !== 'unknown' && (
        <div className="min-w-0">
          <div className="truncate opacity-60" style={{ fontSize: '0.8em' }}>
            {quay.name}
          </div>
          <div className="truncate font-semibold">{etaText(e)}</div>
        </div>
      )}
      <div className="mt-auto opacity-50" style={{ fontSize: '0.8em' }}>
        {v.missing ? 'Ikke sett siste døgn' : `Sist sett ${ago(v.msgtime, now)}`}
      </div>
    </div>
  );
}

function Cards({ vessels, quay, now }) {
  const n = Math.max(1, vessels.length);
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  return (
    <div
      className="grid h-full w-full gap-[2cqmin]"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        // Et kort er ~12,5 linjer høyt og ~14 tegn bredt (i em) – skriften følger den trangeste.
        fontSize: `min(${(100 / cols / 14).toFixed(2)}cqw, ${(100 / rows / 12.5).toFixed(2)}cqh)`
      }}
    >
      {vessels.map((v) => (
        <VesselCard key={v.mmsi} v={v} quay={quay} now={now} />
      ))}
    </div>
  );
}

function Arrivals({ vessels, quay, now }) {
  if (!quay) return <FeedMessage>Velg en kai for ankomsttavlen</FeedMessage>;
  const order = { arrived: 0, eta: 1, still: 2, unknown: 3 };
  const rows = vessels
    .map((v) => ({ v, e: etaTo(v, quay, now) }))
    .sort((a, b) => order[a.e.state] - order[b.e.state] || (a.e.eta?.getTime() ?? 0) - (b.e.eta?.getTime() ?? 0) || (a.e.distanceNm ?? 1e9) - (b.e.distanceNm ?? 1e9));
  return (
    <div className="flex h-full w-full flex-col" style={{ fontSize: '5cqmin' }}>
      <div className="mb-[0.4em] font-bold" style={{ fontSize: '1.3em' }}>
        Ankomster · {quay.name}
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-start gap-[0.3em]">
        {rows.map(({ v, e }) => (
          <div key={v.mmsi} className="flex items-center gap-[0.6em] rounded-[0.4em] px-[0.6em] py-[0.35em]" style={{ background: 'rgba(0,0,0,0.28)' }}>
            <span className="inline-block h-[0.9em] w-[0.3em] shrink-0 rounded" style={{ background: v.color }} />
            <span className="min-w-0 flex-1 truncate font-semibold">{v.name}</span>
            <span className="shrink-0 opacity-70 tabular-nums">{e.distanceNm != null ? `${e.distanceNm.toFixed(1).replace('.', ',')} nm` : ''}</span>
            <span className="w-[38%] shrink-0 text-right font-bold tabular-nums">{v.missing ? 'Ingen data' : etaText(e)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Anløpsplan (tillegg i NAIS): kjente anløp med planlagt tid, live status fra
 * AIS for båter i flåten, neste havn og varer som lastes/losses.
 */
function CallsBoard({ calls, vessels, quays, quayId, days, title, groups, now }) {
  const byMmsi = new Map(vessels.map((v) => [String(v.mmsi), v]));
  const quayById = new Map(quays.map((q) => [q.id, q]));
  const rows = currentCalls(calls, { now, days, quayId: quayId || null }).filter((c) => {
    if (!groups) return true;
    return groups.has(byMmsi.get(String(c.mmsi))?.group || '');
  });
  const quay = quayId ? quayById.get(quayId) : null;
  if (!rows.length) return <FeedMessage>{`Ingen anløp de neste ${days} dagene`}</FeedMessage>;
  const shown = rows.slice(0, 8);
  // Høyden i «linjer»: hver rad har navnelinje + én linje per vare (mindre skrift).
  const lines = Math.max(4 * 2.6, shown.reduce((n, c) => n + 1.9 + 0.9 * Math.min(6, c.cargo?.length || 0), 0) + shown.length * 0.6);
  return (
    <div className="flex h-full w-full flex-col" style={{ fontSize: `min(${(100 / (lines + 2.5)).toFixed(2)}cqh, 2.6cqw)` }}>
      <div className="mb-[0.5em] flex items-baseline gap-[0.5em] font-bold" style={{ fontSize: '1.35em' }}>
        <span className="truncate">{title || 'Anløp'}</span>
        <span className="truncate font-medium opacity-60" style={{ fontSize: '0.7em' }}>
          {quay ? quay.name : 'alle kaier'}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[0.4em]">
        {shown.map((c) => {
          const v = c.mmsi ? byMmsi.get(String(c.mmsi)) : null;
          const q = quayById.get(c.quayId);
          const live = v && !v.missing && q ? etaTo(v, q, now) : null;
          const planned = callDate(c.eta).getTime();
          const atQuay = live?.state === 'arrived';
          // Forsinket kan bare sies når det planlagte klokkeslettet er kjent.
          const late = hasClock(c.eta) && live?.state === 'eta' && live.eta.getTime() - planned > 3600_000;
          const status = atQuay ? 'Ved kai' : live?.state === 'eta' ? etaText(live) : null;
          return (
            <div key={c.id} className="flex shrink-0 items-center gap-[0.8em] rounded-[0.5em] px-[0.7em] py-[0.45em]" style={{ background: atQuay ? 'rgba(34,197,94,0.22)' : 'rgba(0,0,0,0.28)' }}>
              <div className="w-[8.2em] shrink-0 whitespace-nowrap leading-tight">
                <div className="truncate font-bold tabular-nums">{callTimeText(c.eta, now)}</div>
                {c.etd && (
                  <div className="truncate opacity-60 tabular-nums" style={{ fontSize: '0.72em' }}>
                    avg. {callTimeText(c.etd, now)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center gap-[0.4em]">
                  {v && <span className="inline-block h-[0.8em] w-[0.28em] shrink-0 rounded" style={{ background: v.color }} />}
                  <span className="truncate font-semibold">{c.name || v?.name || c.mmsi}</span>
                  {!quay && q && <span className="shrink-0 truncate opacity-60" style={{ fontSize: '0.75em' }}>· {q.name}</span>}
                </div>
                {c.cargo?.length > 0 && (
                  <div className="mt-[0.15em] grid opacity-80" style={{ fontSize: '0.75em' }}>
                    {c.cargo.slice(0, 6).map((g, i) => (
                      <span key={i} className="truncate">
                        {cargoLine(g)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="w-[8em] shrink-0 text-right leading-tight">
                {status && (
                  <div className={`truncate font-bold tabular-nums ${late ? 'text-amber-300' : atQuay ? 'text-green-300' : ''}`} style={{ fontSize: '0.85em' }}>
                    {status}
                  </div>
                )}
                {c.next && (
                  <div className="truncate opacity-70" style={{ fontSize: '0.75em' }}>
                    → {c.next}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {rows.length > shown.length && (
          <div className="text-center opacity-60" style={{ fontSize: '0.75em' }}>
            + {rows.length - shown.length} anløp til
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppSlide({ slide, chromeless }) {
  const c = slide.config || {};
  const { data, error } = useFeed(slide.elementId, `${c.appId}`, 60_000);
  const now = useNow();
  const bare = chromeless && c.frame !== true;
  const view = c.view || 'map';
  const box = `flex h-full w-full flex-col overflow-hidden ${view === 'map' ? 'rounded-xl' : bare ? '' : 'rounded-xl bg-black/30 p-[4%]'}`;
  const style = { containerType: 'size', color: c.color || '#ffffff' };

  // Stabile lister, så kartet (memo) ikke tegnes på nytt ved hver endring i editoren.
  const mmsiKey = Array.isArray(c.mmsi) ? c.mmsi.join(',') : '';
  const colorBy = c.colorBy || 'type';
  const groupsKey = Array.isArray(c.groups) && c.groups.length ? JSON.stringify(c.groups) : '';
  const vessels = useMemo(() => {
    const wanted = mmsiKey ? new Set(mmsiKey.split(',')) : null;
    const groups = groupsKey ? new Set(JSON.parse(groupsKey)) : null;
    // Kort og tavle bruker samme farge som kartet (skipsklasse eller egen farge).
    return (data?.vessels || [])
      .filter((v) => !wanted || wanted.has(String(v.mmsi)))
      .filter((v) => !groups || groups.has(v.group || '')).map((v) => ({ ...v, color: vesselColor(v, colorBy) }));
  }, [data, mmsiKey, groupsKey, colorBy]);
  const quay = useMemo(() => (data?.quays || []).find((q) => q.id === c.quayId) || null, [data, c.quayId]);
  const mapQuays = useMemo(
    () => (quay ? [quay] : c.area === 'norway' ? [] : (data?.quays || []).filter(hasPosition)),
    [data, quay, c.area]
  );

  if (!c.appId) {
    return (
      <div className={box} style={style}>
        <FeedMessage>Velg en Flatr App</FeedMessage>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={box} style={style}>
        <FeedMessage>{error || 'Henter data …'}</FeedMessage>
      </div>
    );
  }

  // Bursdager: de neste bursdagene – eller kakeregn når noen har bursdag i dag.
  if (data.app?.kind === 'birthdays') {
    // I editoren vises alt (med forklaring); på skjermene skjules det som ikke er aktuelt.
    const inEditor = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
    if (c.effect === 'rain') {
      const party = (data.items || []).some((b) => b.days === 0);
      if (!party && !inEditor) return null;
      return (
        <div className="relative h-full w-full">
          <CakeRain amount={c.amount} opacity={c.opacity} seed={slide.elementId || 1} still={inEditor && !party} />
          {inEditor && !party && (
            <div className="absolute bottom-[3%] left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-[1.2em] py-[0.4em] text-[min(3.2cqh,2.4cqw)] font-semibold text-white" style={{ containerType: 'normal' }}>
              Kakeregn – vises når noen har bursdag
            </div>
          )}
        </div>
      );
    }
    const days = c.days != null ? Number(c.days) : null;
    const empty = days != null && c.autoHide !== false && !inWindow(data.items || [], days).length;
    if (empty && !inEditor) return null;
    return (
      // Ramme er standard her (et kort), i motsetning til de andre widgetene.
      <div className={c.frame === false ? 'flex h-full w-full flex-col overflow-hidden' : 'flex h-full w-full flex-col overflow-hidden rounded-xl bg-black/30 p-[4%]'} style={style}>
        {empty && (
          <div className="mb-[2%] shrink-0 text-center text-[min(5cqh,4cqw)] font-semibold opacity-60">Skjules på skjermen nå – ingen i perioden</div>
        )}
        <BirthdayView items={data.items || []} days={days} valign={c.valign || 'top'} count={Number(c.count) || 3} title={c.title ?? 'Bursdager'} />
      </div>
    );
  }

  // Dagens meny, tidevann og fotball: ferdige visninger med kort/ramme som standard.
  if (['menu', 'tides', 'football'].includes(data.app?.kind)) {
    const card = c.frame === false ? 'flex h-full w-full flex-col overflow-hidden' : 'flex h-full w-full flex-col overflow-hidden rounded-xl bg-black/30 p-[4%]';
    return (
      <div className={card} style={style}>
        {data.app.kind === 'menu' && <MenuView data={data} view={c.menuView || 'today'} title={c.title} showPrice={c.showPrice !== false} showTags={c.showTags !== false} />}
        {data.app.kind === 'tides' && <TidesView place={data.places?.[c.placeId] || Object.values(data.places || {})[0]} view={c.tideView || 'both'} title={c.title} now={now} />}
        {data.app.kind === 'football' && <FootballView data={data} view={c.footballView || 'next'} teamId={c.teamId} leagueId={c.leagueId} title={c.title} max={c.max} />}
      </div>
    );
  }

  // Egne apper (appbyggeren): ferdige felt + valgt mal.
  if (data.app?.kind === 'custom') {
    const isMap = data.template === 'map';
    return (
      <div className={isMap ? 'flex h-full w-full overflow-hidden rounded-xl' : box} style={style}>
        <CustomAppView template={data.template} display={data.display} items={data.items || []} />
      </div>
    );
  }

  if (view === 'calls') {
    return (
      <div className={box} style={style}>
        <CallsBoard
          calls={data.calls || []}
          vessels={(data.vessels || []).map((v) => ({ ...v, color: vesselColor(v, colorBy) }))}
          quays={data.quays || []}
          quayId={c.quayId}
          days={Number(c.callDays) || 7}
          title={c.title}
          groups={groupsKey ? new Set(JSON.parse(groupsKey)) : null}
          now={now}
        />
      </div>
    );
  }

  if (!vessels.length) {
    return (
      <div className={box} style={style}>
        <FeedMessage>Ingen båter i flåten ennå</FeedMessage>
      </div>
    );
  }

  return (
    <div className={box} style={style}>
      {view === 'map' && (
        <FleetMap
          vessels={vessels}
          quays={mapQuays}
          area={c.area || 'fleet'}
          labels={c.labels !== false}
          highlightQuayId={c.quayId}
          mapStyle={c.mapStyle || 'nautical'}
          colorBy={colorBy}
          legend={c.legend !== false}
        />
      )}
      {view === 'cards' && <Cards vessels={vessels} quay={quay} now={now} />}
      {view === 'arrivals' && <Arrivals vessels={vessels} quay={quay} now={now} />}
    </div>
  );
}
