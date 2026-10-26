import { useFeed, FeedMessage } from './useFeed.jsx';
import WeatherIcon from './WeatherIcon.jsx';

// Vær fra MET/Yr. layout: 'now' (nå), 'hours' (neste timer), 'days' (neste dager).
const round = (t) => (t == null ? '–' : `${Math.round(t)}°`);
const hourLabel = (iso) => new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('nb-NO', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');

export default function WeatherSlide({ slide, chromeless }) {
  const c = slide.config || {};
  const { data, error } = useFeed(slide.elementId, `${c.lat},${c.lon}`, 15 * 60_000);
  const bare = chromeless && c.frame !== true;
  const box = `flex h-full w-full flex-col overflow-hidden ${bare ? '' : 'rounded-xl bg-black/30 p-[4%]'}`;
  const style = { containerType: 'size', color: c.color || '#ffffff' };

  if (c.lat == null || c.lon == null) {
    return (
      <div className={box} style={style}>
        <FeedMessage>Velg et sted for værmeldingen</FeedMessage>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={box} style={style}>
        <FeedMessage>{error || 'Henter vær …'}</FeedMessage>
      </div>
    );
  }

  const layout = c.layout || 'now';
  return (
    <div className={box} style={style}>
      {layout === 'now' && data.now && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-[3%] text-center">
          <div className="flex items-center justify-center gap-[6%]" style={{ height: '55%' }}>
            <WeatherIcon code={data.now.symbol} className="h-full w-auto" title={data.now.symbol} />
            <span className="font-bold leading-none" style={{ fontSize: '32cqmin' }}>
              {round(data.now.temp)}
            </span>
          </div>
          <div className="font-semibold" style={{ fontSize: '9cqmin' }}>
            {c.place}
          </div>
          <div className="opacity-75" style={{ fontSize: '6.5cqmin' }}>
            {data.now.wind != null && `Vind ${Math.round(data.now.wind)} m/s`}
            {data.now.precip ? ` · ${data.now.precip} mm` : ''}
          </div>
        </div>
      )}

      {layout === 'hours' && (
        <div className="flex h-full w-full flex-col">
          <div className="font-semibold" style={{ fontSize: '7cqmin' }}>
            {c.place}
          </div>
          <div className="mt-[3%] grid flex-1 grid-cols-6 gap-[2%]">
            {data.hours.slice(0, 6).map((h) => (
              <div key={h.time} className="flex flex-col items-center justify-center gap-[6%]">
                <span className="opacity-75" style={{ fontSize: '5.5cqmin' }}>
                  {hourLabel(h.time)}
                </span>
                <WeatherIcon code={h.symbol} className="w-[80%]" title={h.symbol} />
                <span className="font-bold tabular-nums" style={{ fontSize: '8cqmin' }}>
                  {round(h.temp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {layout === 'days' && (
        <div className="flex h-full w-full flex-col">
          <div className="font-semibold" style={{ fontSize: '7cqmin' }}>
            {c.place}
          </div>
          <div className="mt-[3%] flex flex-1 flex-col justify-around">
            {data.days.slice(0, 5).map((d) => (
              <div key={d.date} className="flex items-center gap-[4%]" style={{ fontSize: '7cqmin' }}>
                <span className="w-[22%] capitalize opacity-80">{dayLabel(d.date)}</span>
                <WeatherIcon code={d.symbol} className="h-[1.6em] w-[1.6em]" title={d.symbol} />
                <span className="ml-auto font-bold tabular-nums">{round(d.max)}</span>
                <span className="w-[16%] text-right tabular-nums opacity-60">{round(d.min)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto text-right opacity-50" style={{ fontSize: '3.2cqmin' }}>
        {data.credit}
      </div>
    </div>
  );
}
