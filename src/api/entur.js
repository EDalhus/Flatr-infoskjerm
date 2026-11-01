// Kollektivtrafikk fra Entur (Flatr-appen «Avganger»): avganger i sanntid fra
// holdeplassene kunden har valgt. Entur er gratis og uten nøkkel, men vil ha
// ET-Client-Name i hver forespørsel.
//   Holdeplass-søk: api.entur.io/geocoder/v1/autocomplete
//   Avganger:       api.entur.io/journey-planner/v3/graphql

const CLIENT = 'flatr-infoskjerm';
const HEADERS = { 'ET-Client-Name': CLIENT, Accept: 'application/json' };
export const MAX_STOPS = 6;
const DEPARTURES_PER_STOP = 40;
const STOP_ID = /^NSR:StopPlace:\d{1,9}$/;

// Kategoriene fra holdeplass-søket -> transportmiddel (som i avgangene).
const CATEGORY_MODE = {
  onstreetBus: 'bus',
  busStation: 'bus',
  coachStation: 'coach',
  onstreetTram: 'tram',
  tramStation: 'tram',
  metroStation: 'metro',
  railStation: 'rail',
  ferryPort: 'water',
  ferryStop: 'water',
  harbourPort: 'water',
  airport: 'air',
  liftStation: 'lift'
};

async function enturFetch(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...HEADERS, ...init.headers }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Entur svarte ${res.status}`);
  return res.json();
}

/** Holdeplasser som passer søket: [{ id, name, place, modes }]. */
export async function searchStops(q) {
  const text = String(q || '').trim().slice(0, 80);
  if (text.length < 2) return [];
  const url = `https://api.entur.io/geocoder/v1/autocomplete?text=${encodeURIComponent(text)}&size=8&layers=venue&lang=no`;
  const body = await enturFetch(url);
  return (body.features || [])
    .map((f) => f.properties || {})
    .filter((p) => STOP_ID.test(p.id || ''))
    .map((p) => ({
      id: p.id,
      name: String(p.name || '').slice(0, 80),
      place: [p.locality, p.county].filter((x, i, a) => x && a.indexOf(x) === i).join(', '),
      modes: [...new Set((p.category || []).map((c) => CATEGORY_MODE[c]).filter(Boolean))]
    }));
}

/** Rydder appens innstillinger: { stops: [{ id, name }] }. */
export function cleanEnturConfig(input) {
  const seen = new Set();
  const stops = (Array.isArray(input?.stops) ? input.stops : [])
    .filter((s) => STOP_ID.test(String(s?.id || '')) && !seen.has(s.id) && seen.add(s.id))
    .slice(0, MAX_STOPS)
    .map((s) => ({ id: s.id, name: String(s.name || '').trim().slice(0, 80) || s.id }));
  return { stops };
}

const QUERY = `query($ids: [String]!, $n: Int!) {
  stopPlaces(ids: $ids) {
    id
    name
    estimatedCalls(numberOfDepartures: $n, timeRange: 72000, includeCancelledTrips: true) {
      realtime
      aimedDepartureTime
      expectedDepartureTime
      cancellation
      quay { publicCode }
      destinationDisplay { frontText }
      serviceJourney { line { publicCode transportMode presentation { colour textColour } } }
      situations { summary { value language } }
    }
  }
}`;

const hex = (v) => (/^[0-9a-f]{6}$/i.test(v || '') ? `#${v}` : null);

/** Avgangene for holdeplassene i appen: { stops: [{ id, name, departures }] }. */
export async function enturData(config) {
  const stops = cleanEnturConfig(config).stops;
  if (!stops.length) return { stops: [], fetched_at: new Date().toISOString() };
  const body = await enturFetch('https://api.entur.io/journey-planner/v3/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { ids: stops.map((s) => s.id), n: DEPARTURES_PER_STOP } })
  });
  if (body.errors?.length && !body.data) throw new Error(`Entur: ${body.errors[0].message || 'feil i svaret'}`);
  const byId = Object.fromEntries((body.data?.stopPlaces || []).filter(Boolean).map((p) => [p.id, p]));
  return {
    stops: stops.map((s) => ({
      id: s.id,
      name: s.name || byId[s.id]?.name || s.id,
      departures: (byId[s.id]?.estimatedCalls || []).map((c) => {
        const line = c.serviceJourney?.line || {};
        const notice = (c.situations || []).map((x) => (x.summary || []).find((t) => t.language === 'no' || t.language === 'nob') || x.summary?.[0]).find(Boolean);
        return {
          line: line.publicCode || '',
          mode: line.transportMode || 'bus',
          destination: c.destinationDisplay?.frontText || '',
          platform: c.quay?.publicCode || '',
          aimed: c.aimedDepartureTime,
          expected: c.expectedDepartureTime || c.aimedDepartureTime,
          realtime: !!c.realtime,
          cancelled: !!c.cancellation,
          color: hex(line.presentation?.colour),
          text_color: hex(line.presentation?.textColour),
          notice: notice?.value ? String(notice.value).slice(0, 140) : null
        };
      })
    })),
    fetched_at: new Date().toISOString()
  };
}
