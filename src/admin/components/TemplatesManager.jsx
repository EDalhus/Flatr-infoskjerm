// Maler – et gratis marked der alle Flatr-kunder deler og henter:
//   • Kits: hele presentasjoner (f.eks. kafémeny) der man bare bytter tekst og bilder
//   • Lysbilder: ett ferdig oppsett som legges til i en presentasjon
//   • Temaer: farger, font og bakgrunn som legges over en presentasjon
// Bilder i en delt mal lagres én gang på serveren og deles av alle som bruker den.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { backgroundStyle, FONTS } from '../../lib/deck.js';
import SlideThumb from './deck/SlideThumb.jsx';
import { Icon, IconButton, Button, Input, Textarea, Select, Field, ColorInput, Segmented, PageHeader, ErrorText } from './ui.jsx';

export const KIND_LABEL = { kit: 'Kit', slide: 'Lysbilde', theme: 'Tema' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Forhåndsvisning av en mal: første lysbilde, eller en temaprøve. */
export function MarketPreview({ item }) {
  const p = item.payload || {};
  if (item.kind === 'theme') {
    const t = p.theme || {};
    return (
      <div
        className="relative flex w-full flex-col justify-center gap-1 overflow-hidden rounded border border-hair px-[8%]"
        style={{ aspectRatio: '16 / 9', ...backgroundStyle(t.background) }}
      >
        <span className="text-2xl font-extrabold leading-none" style={{ color: t.heading_color || '#fff', fontFamily: t.font || undefined }}>
          Overskrift
        </span>
        <span className="text-sm" style={{ color: t.text_color || '#fff', fontFamily: t.font || undefined }}>
          Brødtekst og detaljer
        </span>
        <span className="mt-1 h-1.5 w-12 rounded-full" style={{ background: t.accent || '#fff' }} />
      </div>
    );
  }
  const first = p.slides?.[0];
  if (!first) return <div className="aspect-video rounded bg-zone" />;
  const portrait = item.orientation === 'portrait';
  return (
    <div className={`flex items-center justify-center rounded bg-zone ${portrait ? 'aspect-video' : ''}`}>
      <div className={portrait ? 'h-full w-[32%]' : 'w-full'}>
        <SlideThumb slide={first} orientation={item.orientation} />
      </div>
    </div>
  );
}

function MarketCard({ item, onUse, onWithdraw }) {
  const count = item.payload?.slides?.length || 0;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-hair bg-card p-2.5 shadow-card">
      <MarketPreview item={item} />
      <div className="flex flex-1 flex-col gap-1 px-1.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-bold text-ink">{item.title}</span>
          <span className="shrink-0 rounded-full bg-zone px-2 py-0.5 text-[11px] font-semibold text-muted">
            {KIND_LABEL[item.kind]}
            {item.kind === 'kit' ? ` · ${count}` : ''}
          </span>
        </div>
        {item.description && <p className="m-0 line-clamp-2 text-sm text-muted">{item.description}</p>}
        <span className="mt-auto pt-1 text-xs text-muted">
          {item.mine ? 'Delt av dere' : `av ${item.author || 'Flatr'}`} · brukt {plural(item.installs, 'gang', 'ganger')}
        </span>
      </div>
      <div className="flex gap-2 px-1.5 pb-1.5">
        <Button className="flex-1" onClick={() => onUse(item)}>
          Bruk
        </Button>
        {item.mine && (
          <Button variant="outline" onClick={() => onWithdraw(item)} title="Fjern fra markedet">
            Trekk tilbake
          </Button>
        )}
      </div>
    </article>
  );
}

function Dialog({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-card p-6 shadow-pop">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="m-0 flex-1 text-lg font-bold text-ink">{title}</h2>
          <IconButton name="x" label="Lukk" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

/** Bruk en mal: kit -> ny presentasjon; lysbilde/tema -> velg presentasjon. */
function UseDialog({ item, playlists, onClose, onDone }) {
  const [target, setTarget] = useState(item.kind === 'theme' ? String(playlists[0]?.id ?? '') : 'new');
  const [name, setName] = useState(item.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.market.install(item.id, target === 'new' ? { name } : { playlist_id: Number(target) });
      onDone(res);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Bruk «${item.title}»`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <MarketPreview item={item} />
        {item.kind === 'theme' && (
          <p className="m-0 text-sm text-muted">Temaet bytter bakgrunn, font og farger på alle lysbildene i presentasjonen du velger.</p>
        )}
        {item.kind !== 'kit' && (
          <Field label={item.kind === 'theme' ? 'Bruk på presentasjonen' : 'Legg lysbildet i'}>
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              {item.kind === 'slide' && <option value="new">+ Ny presentasjon</option>}
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {target === 'new' && (
          <Field label="Navn på presentasjonen">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
        )}
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || (item.kind === 'theme' && !target)}>
            {busy ? 'Henter …' : item.kind === 'theme' ? 'Bruk temaet' : 'Hent og rediger'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Avbryt
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const DEFAULT_THEME = {
  background: { type: 'gradient', from: '#1f5566', to: '#0f2733', angle: 135 },
  font: '',
  heading_color: '#ffffff',
  text_color: '#d7e3e8',
  accent: '#34d399'
};

/** Del noe til markedet. */
function ShareDialog({ playlists, templates, initial, onClose, onDone }) {
  const [kind, setKind] = useState(initial?.kind || 'kit');
  const [playlistId, setPlaylistId] = useState(String(initial?.playlist_id ?? playlists[0]?.id ?? ''));
  const [templateId, setTemplateId] = useState(String(initial?.template_id ?? templates[0]?.id ?? ''));
  const [orientation, setOrientation] = useState('landscape');
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setT = (patch) => setTheme((t) => ({ ...t, ...patch }));
  const bg = theme.background;

  const source = kind === 'kit' ? { playlist_id: Number(playlistId) } : kind === 'slide' ? { template_id: Number(templateId), orientation } : { theme };
  const ready = kind === 'kit' ? !!playlistId : kind === 'slide' ? !!templateId : true;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(await api.market.publish({ kind, title, description, source }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog title="Del en mal med alle" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'kit', label: 'Hel presentasjon' },
            { value: 'slide', label: 'Ett lysbilde' },
            { value: 'theme', label: 'Tema' }
          ]}
          className="w-fit"
        />

        {kind === 'kit' && (
          <Field label="Presentasjon" hint="Alle lysbildene deles som et kit. Bilder følger med.">
            <Select value={playlistId} onChange={(e) => setPlaylistId(e.target.value)}>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({plural(p.slide_count, 'lysbilde', 'lysbilder')})
                </option>
              ))}
            </Select>
          </Field>
        )}

        {kind === 'slide' &&
          (templates.length ? (
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="Lysbilde-mal">
                <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Format">
                <Select value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                  <option value="landscape">Liggende</option>
                  <option value="portrait">Stående</option>
                </Select>
              </Field>
            </div>
          ) : (
            <p className="m-0 rounded-xl bg-zone px-4 py-3 text-sm text-muted">
              Du har ingen lysbilde-maler ennå. Åpne en presentasjon og velg «Lagre som mal» på lysbildet du vil dele.
            </p>
          ))}

        {kind === 'theme' && (
          <div className="flex flex-col gap-3">
            <MarketPreview item={{ kind: 'theme', payload: { theme } }} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bakgrunn">
                <div className="flex items-center gap-2">
                  <ColorInput value={bg.from || bg.color} onChange={(e) => setT({ background: { type: 'gradient', angle: 135, to: bg.to || bg.color, from: e.target.value } })} />
                  <ColorInput value={bg.to || bg.color} onChange={(e) => setT({ background: { type: 'gradient', angle: 135, from: bg.from || bg.color, to: e.target.value } })} />
                </div>
              </Field>
              <Field label="Font">
                <Select value={theme.font} onChange={(e) => setT({ font: e.target.value })}>
                  {FONTS.map((f) => (
                    <option key={f.label} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Overskrifter">
                <ColorInput value={theme.heading_color} onChange={(e) => setT({ heading_color: e.target.value })} />
              </Field>
              <Field label="Brødtekst">
                <ColorInput value={theme.text_color} onChange={(e) => setT({ text_color: e.target.value })} />
              </Field>
              <Field label="Aksent (figurer)">
                <ColorInput value={theme.accent} onChange={(e) => setT({ accent: e.target.value })} />
              </Field>
            </div>
          </div>
        )}

        <Field label="Navn">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} placeholder={kind === 'theme' ? 'Nordlys' : 'Kafémeny'} />
        </Field>
        <Field label="Beskrivelse (valgfritt)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} placeholder="Hva passer den til?" />
        </Field>
        <p className="m-0 text-xs text-muted">Malen blir synlig for alle Flatr-kunder, med kontonavnet deres som avsender. Du kan trekke den tilbake når som helst.</p>

        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !ready || !title.trim()}>
            {busy ? 'Deler …' : 'Del med alle'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Avbryt
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function TemplatesManager({ onChange, onNavigate, embedded = false }) {
  const [tab, setTab] = useState('explore');
  const [items, setItems] = useState(null);
  const [mine, setMine] = useState([]);
  const [kind, setKind] = useState('');
  const [sort, setSort] = useState('popular');
  const [query, setQuery] = useState('');
  const [templates, setTemplates] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [using, setUsing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  const loadMarket = () =>
    api.market
      .list({ kind, sort, q: query.trim() })
      .then(setItems)
      .catch((e) => setError(e.message));
  const loadOwn = () =>
    Promise.all([api.templates.list('slide'), api.playlists.list(), api.market.list({ mine: 1 })])
      .then(([t, p, m]) => {
        setTemplates(t || []);
        setPlaylists(p || []);
        setMine(m || []);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadOwn();
  }, []);
  useEffect(() => {
    const t = setTimeout(loadMarket, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [kind, sort, query]);

  const say = (msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 2800);
  };

  const withdraw = async (item) => {
    if (!confirm(`Trekke tilbake «${item.title}»? Den forsvinner fra markedet. De som allerede har hentet den, beholder kopien sin.`)) return;
    try {
      await api.market.remove(item.id);
      say('Malen er trukket tilbake.');
      loadMarket();
      loadOwn();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeTemplate = async (id) => {
    if (!confirm('Slette lysbilde-malen?')) return;
    try {
      await api.templates.remove(id);
      await loadOwn();
      onChange?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const chip = (id, label) => (
    <button
      key={id || 'all'}
      type="button"
      onClick={() => setKind(id)}
      aria-pressed={kind === id}
      className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${
        kind === id ? 'bg-ink text-paper' : 'border border-line bg-card text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* Som fane under Presentasjoner (embedded) står overskriften der. */}
      {!embedded && (
        <PageHeader
          title="Maler"
          subtitle="Ferdige kits, lysbilder og temaer delt av Flatr-brukere. Gratis å hente, og gratis å dele."
          action={
            <Button onClick={() => setSharing({})}>
              <Icon name="plus" className="h-4 w-4" />
              Del en mal
            </Button>
          }
        />
      )}
      {embedded && (
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 pt-2 sm:px-8">
          <p className="m-0 text-sm text-muted">Ferdige kits, lysbilder og temaer delt av Flatr-brukere. Gratis å hente, og gratis å dele.</p>
          <Button variant="outline" size="sm" onClick={() => setSharing({})}>
            <Icon name="plus" className="h-4 w-4" />
            Del en mal
          </Button>
        </div>
      )}
      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 pb-12 pt-4 sm:px-8">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'explore', label: 'Utforsk' },
            { value: 'mine', label: 'Mine maler' }
          ]}
          className="w-fit"
        />
        <ErrorText>{error}</ErrorText>
        {flash && (
          <p role="status" className="m-0 rounded-xl bg-ok-tint px-4 py-2.5 text-sm font-semibold text-ok">
            {flash}
          </p>
        )}

        {tab === 'explore' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {chip('', 'Alle')}
              {chip('kit', 'Kits')}
              {chip('slide', 'Lysbilder')}
              {chip('theme', 'Temaer')}
              <div className="ml-auto flex items-center gap-2">
                <label className="flex w-56 max-w-full items-center gap-2">
                  <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
                  <span className="sr-only">Søk</span>
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søk i maler …" />
                </label>
                <Select value={sort} onChange={(e) => setSort(e.target.value)} className="!w-36" aria-label="Sortering">
                  <option value="popular">Mest brukt</option>
                  <option value="new">Nyeste</option>
                </Select>
              </div>
            </div>

            {items && items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-card px-6 py-14 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-tint text-brand">
                  <Icon name="copy" className="h-7 w-7" />
                </div>
                <h2 className="m-0 text-xl font-bold text-ink">{query || kind ? 'Ingen treff' : 'Ingen maler ennå'}</h2>
                <p className="m-0 max-w-md text-sm text-muted">Har du laget noe fint? Del det, så kan andre bygge videre på det.</p>
                <Button onClick={() => setSharing({})}>Del en mal</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(items || []).map((item) => (
                  <MarketCard key={item.id} item={item} onUse={setUsing} onWithdraw={withdraw} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <section className="space-y-3">
              <div>
                <h2 className="m-0 text-base font-bold text-ink">Lysbilde-maler</h2>
                <p className="m-0 text-sm text-muted">Lag dem med «Lagre som mal» på et lysbilde i editoren. Bare dere ser dem, til dere deler dem.</p>
              </div>
              {templates.length === 0 ? (
                <p className="m-0 rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted">Ingen lysbilde-maler ennå.</p>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {templates.map((t) => (
                    <article key={t.id} className="flex flex-col gap-2 rounded-2xl border border-hair bg-card p-2.5 shadow-card">
                      <SlideThumb slide={t.payload || {}} orientation="landscape" />
                      <div className="flex items-center gap-1 px-1">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{t.name}</span>
                        <IconButton name="share" label="Del med alle" onClick={() => setSharing({ kind: 'slide', template_id: t.id, title: t.name })} />
                        <IconButton name="trash" label="Slett" tone="danger" onClick={() => removeTemplate(t.id)} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="m-0 text-base font-bold text-ink">Delt av dere</h2>
              {mine.length === 0 ? (
                <p className="m-0 rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted">Dere har ikke delt noe ennå.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {mine.map((item) => (
                    <MarketCard key={item.id} item={item} onUse={setUsing} onWithdraw={withdraw} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {using && (
        <UseDialog
          item={using}
          playlists={playlists}
          onClose={() => setUsing(null)}
          onDone={(res) => {
            setUsing(null);
            onChange?.();
            onNavigate?.('playlists', { edit: res.playlist_id });
          }}
        />
      )}
      {sharing && (
        <ShareDialog
          playlists={playlists}
          templates={templates}
          initial={sharing}
          onClose={() => setSharing(null)}
          onDone={() => {
            setSharing(null);
            setTab('explore');
            setSort('new');
            setKind('');
            say('Takk for at du deler! Malen ligger nå i markedet.');
            loadMarket();
            loadOwn();
          }}
        />
      )}
    </>
  );
}
