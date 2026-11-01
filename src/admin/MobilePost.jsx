// Legg ut fra mobilen (<kunde>.flatr.no/mobil): ta et bilde eller skriv en
// beskjed, velg skjermer og hvor lenge det skal vises, og trykk Publiser.
// Innlegget blir et lysbilde først i presentasjonen hver valgt skjerm viser,
// med sluttdato. Siden kan legges på hjemskjermen som en app (mobil.webmanifest).
// Krever godkjenning kontoen det, publiserer eiere med en gang og andre sender
// til godkjenning.

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { applyBrandToElements, brandBackground } from '../lib/brand.js';
import { Icon } from './components/ui.jsx';

const DURATIONS = [
  { id: 'hour', label: '1 time' },
  { id: 'day', label: 'I dag' },
  { id: '3days', label: '3 dager' },
  { id: 'week', label: '1 uke' },
  { id: 'forever', label: 'Til jeg fjerner det' }
];
const STYLES = [
  { id: 'brand', label: 'Merkevare', bg: null },
  { id: 'dark', label: 'Mørk', bg: { type: 'color', color: '#0f172a' } },
  { id: 'warm', label: 'Varm', bg: { type: 'gradient', from: '#c2410c', to: '#7c2d12', angle: 135 } },
  { id: 'green', label: 'Grønn', bg: { type: 'gradient', from: '#027353', to: '#0b2a22', angle: 135 } }
];
const MARK = '📱 ';

/** Dato og klokkeslett hos kunden (tidssonen i innstillingene). */
function localParts(tz, at = Date.now()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at));
  const g = (t) => p.find((x) => x.type === t)?.value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}
const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Når innlegget slutter å vises (feltene for tidsstyring på lysbildet). */
function expiry(duration, tz) {
  const now = localParts(tz);
  if (duration === 'hour') {
    const end = localParts(tz, Date.now() + 3_600_000);
    // Over midnatt: resten av dagen.
    if (end.date !== now.date) return { active_to_date: now.date };
    return { active_from_date: now.date, active_to_date: now.date, active_from: now.time, active_to: end.time };
  }
  if (duration === 'day') return { active_to_date: now.date };
  if (duration === '3days') return { active_to_date: addDays(now.date, 2) };
  if (duration === 'week') return { active_to_date: addDays(now.date, 6) };
  return {};
}

/** Mobilbilder er store: skaler ned til maks 2560 px før opplasting. */
async function downscale(file, max = 2560) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * s);
  canvas.height = Math.round(bmp.height * s);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

function photoSlide(url, caption) {
  const elements = [{ kind: 'image', x: 0, y: 0, w: 100, h: 100, z: 0, rotation: 0, config: { url, fit: 'contain', radius: 0 } }];
  if (caption.trim()) {
    elements.push(
      { kind: 'shape', x: 0, y: 80, w: 100, h: 20, z: 1, rotation: 0, config: { shape: 'rect', fill: '#000000', radius: 0, opacity: 55 } },
      { kind: 'text', x: 5, y: 82, w: 90, h: 16, z: 2, rotation: 0, config: { text: caption.trim(), size: 72, weight: 700, color: '#ffffff', valign: 'middle', autoFit: true } }
    );
  }
  return { background: { type: 'color', color: '#000000' }, elements };
}

function textSlide(message, style, brand) {
  const bg = STYLES.find((s) => s.id === style)?.bg || brandBackground(brand) || STYLES[3].bg;
  return {
    background: bg,
    elements: applyBrandToElements(
      [{ kind: 'text', x: 8, y: 10, w: 84, h: 80, z: 0, rotation: 0, config: { text: message.trim(), size: 120, weight: 800, color: '#ffffff', align: 'center', valign: 'middle', autoFit: true, lineHeight: 1.15 } }],
      brand
    )
  };
}

/** Lenker så siden kan legges på hjemskjermen som en app. */
function useInstallable() {
  useEffect(() => {
    document.title = 'Legg ut – Flatr';
    const add = (tag, attrs) => {
      const el = document.createElement(tag);
      Object.assign(el, attrs);
      el.dataset.mobil = '1';
      document.head.appendChild(el);
    };
    add('link', { rel: 'manifest', href: '/mobil.webmanifest' });
    add('link', { rel: 'apple-touch-icon', href: '/flatr-180.png' });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'Flatr' });
    add('meta', { name: 'theme-color', content: '#027353' });
    return () => document.querySelectorAll('[data-mobil]').forEach((el) => el.remove());
  }, []);
}

export default function MobilePost() {
  useInstallable();
  const [me, setMe] = useState(undefined); // undefined = laster, null = ikke innlogget
  const [screens, setScreens] = useState([]);
  const [tz, setTz] = useState('Europe/Oslo');
  const [brand, setBrand] = useState(null);
  const [mode, setMode] = useState(null); // photo | text
  const [photo, setPhoto] = useState(null); // { file, url }
  const [caption, setCaption] = useState('');
  const [message, setMessage] = useState('');
  const [style, setStyle] = useState('brand');
  const [targets, setTargets] = useState(new Set());
  const [duration, setDuration] = useState('day');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [posts, setPosts] = useState([]);
  const fileRef = useRef(null);

  const loadPosts = async (list) => {
    const ids = [...new Set((list || screens).map((s) => s.playlist_id).filter(Boolean))];
    const out = [];
    for (const id of ids) for (const s of (await api.deck.get(id).catch(() => [])) || []) if ((s.name || '').startsWith(MARK)) out.push(s);
    setPosts(out.sort((a, b) => b.id - a.id).slice(0, 8));
  };

  useEffect(() => {
    api
      .me()
      .then(async (m) => {
        setMe(m);
        const [list, settings] = await Promise.all([api.screens.list(), api.settings.get().catch(() => ({}))]);
        const usable = (list || []).filter((s) => s.playlist_id);
        setScreens(usable);
        setTargets(new Set(usable.map((s) => s.id)));
        if (settings.timezone) setTz(settings.timezone);
        setBrand(settings.brand || null);
        loadPosts(usable);
      })
      .catch(() => setMe(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = mode === 'photo' ? !!photo : mode === 'text' ? message.trim().length > 0 : false;
  const chosen = useMemo(() => screens.filter((s) => targets.has(s.id)), [screens, targets]);

  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      let slide;
      let title;
      if (mode === 'photo') {
        const blob = await downscale(photo.file);
        const row = await api.media.upload(new File([blob], `mobil-${Date.now()}.jpg`, { type: 'image/jpeg' }), 'Fra mobilen');
        slide = photoSlide(api.media.url(row.id), caption);
        title = caption.trim() || 'Bilde';
      } else {
        slide = textSlide(message, style, brand);
        title = message.trim();
      }
      const name = MARK + title.split('\n')[0].slice(0, 40);
      const dp = expiry(duration, tz);
      const playlists = [...new Set(chosen.map((s) => s.playlist_id))];
      let waiting = 0;
      for (const pid of playlists) {
        // Først i presentasjonen (nyeste mobilinnlegg aller først).
        const created = await api.deck.slide.create({ playlist_id: pid, position: -Math.floor(Date.now() / 1000), name, ...slide });
        await api.deck.slide.update(created.id, { duration_seconds: 12, ...dp });
        const review = await api.review.status(pid).catch(() => null);
        if (review?.required) {
          if (me?.role === 'owner') await api.review.act(pid, 'publish');
          else {
            await api.review.act(pid, 'request', 'Lagt ut fra mobilen');
            waiting++;
          }
        }
      }
      setDone({ screens: chosen.length, waiting });
      setMode(null);
      setPhoto(null);
      setCaption('');
      setMessage('');
      loadPosts();
    } catch (e) {
      setError(e.message || 'Noe gikk galt');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s) => {
    if (!confirm(`Fjerne «${s.name.replace(MARK, '')}» fra skjermen?`)) return;
    await api.deck.slide.remove(s.id).catch((e) => setError(e.message));
    loadPosts();
  };

  if (me === undefined) return <div className="min-h-screen bg-paper" />;
  if (me === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper p-6 text-center text-ink">
        <div>
          <p className="m-0 text-lg font-bold">Logg inn for å legge ut</p>
          <a href="/admin" className="mt-4 inline-block rounded-xl bg-brand px-5 py-3 font-semibold text-onbrand">
            Logg inn
          </a>
        </div>
      </div>
    );
  }

  const chip = (on) => `rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${on ? 'bg-ink text-paper' : 'border border-line bg-card text-muted'}`;

  return (
    <div className="min-h-screen bg-paper px-4 pb-16 pt-6 text-ink" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
      <main className="mx-auto max-w-md space-y-5">
        <header className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Flatr</div>
            <h1 className="m-0 text-2xl font-extrabold">Legg ut på skjermene</h1>
          </div>
          <a href="/admin" className="text-sm font-semibold text-muted">
            Admin
          </a>
        </header>

        {done && (
          <div className="rounded-2xl bg-ok-tint p-4 text-sm font-semibold text-ok">
            {done.waiting ? 'Sendt til godkjenning ✓ Det vises når en eier har godkjent det.' : `Lagt ut på ${done.screens === 1 ? 'én skjerm' : `${done.screens} skjermer`} ✓`}
          </div>
        )}

        {!screens.length ? (
          <p className="m-0 rounded-2xl bg-card p-4 text-sm text-muted">Ingen skjermer viser en presentasjon ennå. Sett opp en skjerm i admin først.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode('photo');
                  setDone(null);
                  fileRef.current?.click();
                }}
                className={`flex flex-col items-center gap-2 rounded-2xl border-2 bg-card p-5 text-base font-bold ${mode === 'photo' ? 'border-brand' : 'border-line'}`}
              >
                <Icon name="image" className="h-7 w-7 text-brand" />
                Bilde
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('text');
                  setDone(null);
                }}
                className={`flex flex-col items-center gap-2 rounded-2xl border-2 bg-card p-5 text-base font-bold ${mode === 'text' ? 'border-brand' : 'border-line'}`}
              >
                <Icon name="megaphone" className="h-7 w-7 text-brand" />
                Beskjed
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPhoto({ file, url: URL.createObjectURL(file) });
                e.target.value = '';
              }}
            />

            {mode === 'photo' && (
              <div className="space-y-3">
                {photo ? (
                  <button type="button" onClick={() => fileRef.current?.click()} className="block w-full overflow-hidden rounded-2xl bg-black">
                    <img src={photo.url} alt="" className="mx-auto max-h-72 object-contain" />
                  </button>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-line p-8 text-sm font-semibold text-muted">
                    Ta et bilde eller velg fra telefonen
                  </button>
                )}
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={120}
                  placeholder="Tekst under bildet (valgfritt)"
                  className="w-full rounded-xl border border-line bg-card px-4 py-3 text-base text-ink outline-none focus:border-brand"
                />
              </div>
            )}

            {mode === 'text' && (
              <div className="space-y-3">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={240}
                  rows={4}
                  autoFocus
                  placeholder="F.eks. «Kaffemaskinen er i stykker – bruk den i 2. etasje»"
                  className="w-full resize-none rounded-2xl border border-line bg-card p-4 text-lg text-ink outline-none focus:border-brand"
                />
                <div className="flex flex-wrap gap-2">
                  {STYLES.map((s) => (
                    <button key={s.id} type="button" onClick={() => setStyle(s.id)} className={chip(style === s.id)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode && (
              <>
                <section className="space-y-2">
                  <h2 className="m-0 text-sm font-bold">Hvilke skjermer</h2>
                  <div className="flex flex-wrap gap-2">
                    {screens.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setTargets((set) => {
                            const next = new Set(set);
                            if (next.has(s.id)) next.delete(s.id);
                            else next.add(s.id);
                            return next;
                          })
                        }
                        className={chip(targets.has(s.id))}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="space-y-2">
                  <h2 className="m-0 text-sm font-bold">Hvor lenge</h2>
                  <div className="flex flex-wrap gap-2">
                    {DURATIONS.map((d) => (
                      <button key={d.id} type="button" onClick={() => setDuration(d.id)} className={chip(duration === d.id)}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </section>
                {error && <p className="m-0 text-sm font-semibold text-danger">{error}</p>}
                <button
                  type="button"
                  onClick={publish}
                  disabled={!ready || !chosen.length || busy}
                  className="w-full rounded-2xl bg-brand px-5 py-4 text-lg font-bold text-onbrand disabled:opacity-40"
                >
                  {busy ? 'Legger ut …' : 'Publiser'}
                </button>
              </>
            )}

            {posts.length > 0 && (
              <section className="space-y-2 pt-4">
                <h2 className="m-0 text-sm font-bold">Lagt ut fra mobilen</h2>
                {posts.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{s.name.replace(MARK, '')}</span>
                    <span className="shrink-0 text-xs text-muted">{s.active_to_date ? `til ${s.active_to_date.slice(8, 10)}.${s.active_to_date.slice(5, 7)}.` : 'til du fjerner det'}</span>
                    <button type="button" onClick={() => remove(s)} className="shrink-0 text-xs font-semibold text-danger">
                      Fjern
                    </button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
