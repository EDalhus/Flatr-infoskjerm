import { PROGRAM_MODES, MESSAGE_EMPHASIS } from '../../../lib/slides.js';
import { FONTS, FONT_WEIGHTS } from '../../../lib/deck.js';
import { isoToLocalInput, localInputToIso } from '../../../lib/time.js';
import { Field, Input, Select, Textarea, Segmented, ButtonGroup, ColorInput } from '../ui.jsx';
import { MediaField } from '../MediaPicker.jsx';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';

const RSS_PRESETS = [
  { label: 'NRK – Toppsaker', url: 'https://www.nrk.no/toppsaker.rss' },
  { label: 'NRK Møre og Romsdal', url: 'https://www.nrk.no/mr/toppsaker.rss' },
  { label: 'NRK Sport', url: 'https://www.nrk.no/sport/toppsaker.rss' },
  { label: 'VG', url: 'https://www.vg.no/rss/feed' },
  { label: 'E24', url: 'https://e24.no/rss2/' },
  { label: 'Teknisk Ukeblad', url: 'https://www.tu.no/rss' }
];

/** Innstillinger for Flatr App: hvilken app, visning, båter og kai. */
function AppFields({ c, set }) {
  const [apps, setApps] = useState(null);
  useEffect(() => {
    api.apps
      .list()
      .then((rows) => setApps((rows || []).filter((a) => ['ais', 'custom', 'birthdays', 'menu', 'tides', 'football'].includes(a.kind))))
      .catch(() => setApps([]));
  }, []);
  const app = (apps || []).find((a) => a.id === c.appId);
  const isCustom = app?.kind === 'custom';
  const isBirthdays = app?.kind === 'birthdays';
  const isOther = ['menu', 'tides', 'football'].includes(app?.kind);
  const fleet = app?.config?.fleet || [];
  const quays = app?.config?.quays || [];
  const picked = new Set((c.mmsi || []).map(String));
  const toggle = (mmsi) => {
    const next = new Set(picked);
    if (next.has(mmsi)) next.delete(mmsi);
    else next.add(mmsi);
    set({ mmsi: [...next] });
  };
  const view = c.view || 'map';
  // Grupper fra flåten (f.eks. rederi). '' = båter uten gruppe.
  const groupNames = [...new Set(fleet.map((b) => b.group || ''))].sort((a, b) => (a ? (b ? a.localeCompare(b, 'nb') : -1) : 1));
  if (groupNames.length === 1 && groupNames[0] === '') groupNames.length = 0;
  const pickedGroups = new Set(Array.isArray(c.groups) ? c.groups : []);
  const toggleGroup = (g) => {
    const next = new Set(pickedGroups);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    set({ groups: [...next] });
  };

  return (
    <div className="grid gap-3">
      <Field label="App">
        <Select value={c.appId ?? ''} onChange={(e) => set({ appId: Number(e.target.value) || null, mmsi: [], quayId: '' })}>
          <option value="">Velg app …</option>
          {(apps || []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      {apps && apps.length === 0 && (
        <p className="m-0 text-xs text-muted">
          Du har ingen aktiverte apper med data ennå. Finn dem i{' '}
          <a href="/admin?view=apps" className="font-semibold text-brand hover:underline">
            Flatr Apps
          </a>
          .
        </p>
      )}
      {isCustom && (
        <>
          <p className="m-0 text-xs text-muted">Visningen bestemmes av appen. Innstillingene finner du under Flatr Apps.</p>
          <Field label="Tekstfarge">
            <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
          </Field>
          <Check label="Vis ramme" checked={c.frame === true} onChange={(v) => set({ frame: v })} />
        </>
      )}
      {isBirthdays && c.effect === 'rain' && (
        <>
          <Field label="Mengde">
            <Segmented
              value={c.amount || 'normal'}
              onChange={(v) => set({ amount: v })}
              options={[
                { value: 'few', label: 'Litt' },
                { value: 'normal', label: 'Normalt' },
                { value: 'many', label: 'Mye' }
              ]}
            />
          </Field>
          <Field label="Synlighet">
            <span className="flex items-center gap-2">
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={c.opacity ?? 1}
                onChange={(e) => set({ opacity: Number(e.target.value) })}
                className="flex-1 accent-brand"
                aria-label="Synlighet"
              />
              <span className="w-10 text-right text-xs tabular-nums text-muted">{Math.round((c.opacity ?? 1) * 100)} %</span>
            </span>
          </Field>
          <p className="m-0 text-xs text-muted">
            Kaker og konfetti regner over dette laget på dager der noen har bursdag – ellers er det usynlig. Legg det fremst og gjør det så stort du vil.
          </p>
        </>
      )}
      {isBirthdays && c.effect !== 'rain' && (
        <>
          <Field label="Overskrift">
            <Input value={c.title ?? 'Bursdager'} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Vis bursdager" hint="Alle som har bursdag i dag og så mange dager fram i tid.">
            <Select value={c.days ?? ''} onChange={(e) => set({ days: Number(e.target.value) })}>
              {c.days == null && <option value="">De {c.count ?? 3} neste (gammel innstilling)</option>}
              <option value={1}>I dag og i morgen</option>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} dager fram i tid
                </option>
              ))}
              <option value={7}>7 dager fram i tid (en uke)</option>
            </Select>
          </Field>
          {c.days != null && (
            <Check label="Skjul boksen når ingen har bursdag i perioden" checked={c.autoHide !== false} onChange={(v) => set({ autoHide: v })} />
          )}
          <Field label="Plassering i boksen" hint="Gjelder når det er få bursdager og det blir ledig plass.">
            <Segmented
              value={c.valign || 'top'}
              onChange={(v) => set({ valign: v })}
              options={[
                { value: 'top', label: 'Topp' },
                { value: 'middle', label: 'Midt' },
                { value: 'bottom', label: 'Bunn' }
              ]}
            />
          </Field>
          <Field label="Tekstfarge">
            <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
          </Field>
          <Check label="Vis ramme" checked={c.frame !== false} onChange={(v) => set({ frame: v })} />
          <p className="m-0 text-xs text-muted">Personer og fødselsdatoer legger du inn under Flatr Apps → Bursdager.</p>
        </>
      )}
      {app?.kind === 'menu' && (
        <>
          <Field label="Visning">
            <Segmented value={c.menuView || 'today'} onChange={(v) => set({ menuView: v })} options={[{ value: 'today', label: 'Dagens meny' }, { value: 'week', label: 'Hele uka' }]} />
          </Field>
          <Field label="Overskrift">
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder={c.menuView === 'week' ? 'Ukens meny' : 'Dagens meny'} />
          </Field>
          <Check label="Vis priser" checked={c.showPrice !== false} onChange={(v) => set({ showPrice: v })} />
          <Check label="Vis merking (allergener, vegetar …)" checked={c.showTags !== false} onChange={(v) => set({ showTags: v })} />
        </>
      )}
      {app?.kind === 'tides' && (
        <>
          <Field label="Sted" hint={(app.config?.places || []).length ? null : 'Legg inn steder under Flatr Apps → Tidevann og sjø.'}>
            <Select value={c.placeId || ''} onChange={(e) => set({ placeId: e.target.value })}>
              {(app.config?.places || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vis">
            <Segmented value={c.tideView || 'both'} onChange={(v) => set({ tideView: v })} options={[{ value: 'tide', label: 'Tidevann' }, { value: 'sea', label: 'Sjø' }, { value: 'both', label: 'Begge' }]} />
          </Field>
        </>
      )}
      {app?.kind === 'football' && (
        <>
          <Field label="Visning">
            <Segmented value={c.footballView || 'next'} onChange={(v) => set({ footballView: v })} options={[{ value: 'next', label: 'Neste' }, { value: 'last', label: 'Resultater' }, { value: 'table', label: 'Tabell' }]} />
          </Field>
          {(c.footballView || 'next') === 'table' ? (
            <Field label="Liga" hint={(app.config?.leagues || []).length ? null : 'Legg til ligaer under Flatr Apps → Fotball.'}>
              <Select value={c.leagueId || ''} onChange={(e) => set({ leagueId: Number(e.target.value) })}>
                {(app.config?.leagues || []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Lag" hint={(app.config?.teams || []).length ? null : 'Legg til lag under Flatr Apps → Fotball.'}>
              <Select value={c.teamId || ''} onChange={(e) => set({ teamId: Number(e.target.value) })}>
                {(app.config?.teams || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Antall">
            <Input type="number" min={3} max={20} value={c.max ?? ((c.footballView || 'next') === 'table' ? 16 : 5)} onChange={(e) => set({ max: Number(e.target.value) || undefined })} />
          </Field>
          <Field label="Overskrift (valgfritt)">
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
        </>
      )}
      {isOther && (
        <>
          <Field label="Tekstfarge">
            <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
          </Field>
          <Check label="Vis ramme" checked={c.frame !== false} onChange={(v) => set({ frame: v })} />
        </>
      )}
      {app && !isCustom && !isBirthdays && !isOther && (
        <>
          <Field label="Visning">
            <Select value={view} onChange={(e) => set({ view: e.target.value })}>
              <option value="map">Kart</option>
              <option value="cards">Båtkort</option>
              <option value="arrivals">Ankomsttavle</option>
              <option value="calls">Anløpsplan (med varer)</option>
            </Select>
          </Field>
          {view === 'calls' && (
            <>
              <Field label="Overskrift">
                <Input value={c.title ?? 'Anløp'} onChange={(e) => set({ title: e.target.value })} />
              </Field>
              <Field label="Vis anløp" hint="Anløpene legger du inn under Flatr Apps → NAIS → Anløp.">
                <Select value={c.callDays ?? 7} onChange={(e) => set({ callDays: Number(e.target.value) })}>
                  {[1, 2, 3, 7, 14, 30].map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? 'I dag og i morgen' : `De neste ${n} dagene`}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {view === 'map' && (
            <Field label="Kartstil">
              <Select value={c.mapStyle || 'nautical'} onChange={(e) => set({ mapStyle: e.target.value })}>
                <option value="nautical">Mørkt (som Kystverket)</option>
                <option value="light">Lyst kart</option>
              </Select>
            </Field>
          )}
          <Field label="Farge på båtene">
            <Select value={c.colorBy || 'type'} onChange={(e) => set({ colorBy: e.target.value })}>
              <option value="type">Etter skipstype (standard på AIS-kart)</option>
              <option value="own">Flåtens egne farger</option>
            </Select>
          </Field>
          {view === 'map' && (
            <Field label="Utsnitt">
              <Select value={c.area || 'fleet'} onChange={(e) => set({ area: e.target.value })}>
                <option value="fleet">Zoom til båtene</option>
                <option value="norway">Hele Norge</option>
              </Select>
            </Field>
          )}
          <Field
            label={view === 'map' ? 'Kai (valgfritt)' : view === 'arrivals' ? 'Kai' : view === 'calls' ? 'Kai (tom = alle kaier)' : 'Vis ETA til kai'}
            hint={quays.length ? null : 'Legg inn kaier i appen for å få ETA.'}
          >
            <Select value={c.quayId || ''} onChange={(e) => set({ quayId: e.target.value })}>
              <option value="">{view === 'map' || view === 'calls' ? 'Alle kaier' : 'Ingen'}</option>
              {quays.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </Select>
          </Field>
          {groupNames.length > 0 && (
            <Field label="Grupper" hint={pickedGroups.size ? 'Bare båter i de valgte gruppene vises.' : 'Ingen valgt = alle grupper'}>
              <div className="flex flex-wrap gap-1.5">
                {groupNames.map((g) => {
                  const on = pickedGroups.has(g);
                  return (
                    <button
                      key={g || '-'}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleGroup(g)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${on ? 'bg-brand text-onbrand' : 'bg-zone text-muted hover:text-ink'}`}
                    >
                      {g || 'Uten gruppe'}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
          {view !== 'calls' && (
          <Field label="Båter" hint={picked.size ? `${picked.size} valgt` : pickedGroups.size ? 'Ingen valgt = alle i gruppene' : 'Ingen valgt = hele flåten'}>
            <div className="grid max-h-48 gap-1 overflow-y-auto">
              {fleet.filter((b) => !pickedGroups.size || pickedGroups.has(b.group || '')).map((b) => (
                <Check key={b.mmsi} label={b.name} checked={picked.has(String(b.mmsi))} onChange={() => toggle(String(b.mmsi))} />
              ))}
              {!fleet.length && <span className="text-xs text-muted">Flåten er tom.</span>}
            </div>
          </Field>
          )}
          {view === 'map' ? (
            <>
              <Check label="Vis navn på kartet" checked={c.labels !== false} onChange={(v) => set({ labels: v })} />
              {(c.colorBy || 'type') === 'type' && (
                <Check label="Vis fargeforklaring" checked={c.legend !== false} onChange={(v) => set({ legend: v })} />
              )}
            </>
          ) : (
            <>
              <Field label="Tekstfarge">
                <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
              </Field>
              <Check label="Vis ramme" checked={c.frame === true} onChange={(v) => set({ frame: v })} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Innstillinger for bildekarusellen: mappe fra mediebiblioteket. */
function CarouselFields({ c, set }) {
  const [folders, setFolders] = useState(null);
  useEffect(() => {
    api.media
      .list()
      .then((rows) => {
        const count = {};
        for (const m of rows || []) if (m.folder && (m.content_type || '').startsWith('image/')) count[m.folder] = (count[m.folder] || 0) + 1;
        setFolders(Object.entries(count).sort((a, b) => a[0].localeCompare(b[0], 'nb')));
      })
      .catch(() => setFolders([]));
  }, []);
  return (
    <div className="grid gap-3">
      <Field label="Mappe" hint="Karusellen viser alle bildene i mappen. Legg til eller fjern bilder i mediebiblioteket.">
        <Select value={c.folder || ''} onChange={(e) => set({ folder: e.target.value })}>
          <option value="">Velg mappe …</option>
          {(folders || []).map(([name, n]) => (
            <option key={name} value={name}>
              {name} ({n} {n === 1 ? 'bilde' : 'bilder'})
            </option>
          ))}
          {c.folder && folders && !folders.some(([n]) => n === c.folder) && <option value={c.folder}>{c.folder} (tom)</option>}
        </Select>
      </Field>
      {folders && folders.length === 0 && (
        <p className="m-0 text-xs text-muted">
          Du har ingen mapper med bilder ennå. Lag en i{' '}
          <a href="/admin?view=media" className="font-semibold text-brand hover:underline">
            mediebiblioteket
          </a>
          .
        </p>
      )}
      <Field label="Sekunder pr. bilde">
        <Input type="number" min={2} max={600} value={c.seconds ?? 8} onChange={(e) => set({ seconds: Number(e.target.value) || 8 })} />
      </Field>
      <Field label="Tilpasning">
        <Select value={c.fit || 'contain'} onChange={(e) => set({ fit: e.target.value })}>
          <option value="contain">Vis hele bildet</option>
          <option value="cover">Fyll flaten</option>
        </Select>
      </Field>
      <Field label="Overgang">
        <Select value={c.transition || 'fade'} onChange={(e) => set({ transition: e.target.value })}>
          <option value="fade">Ton over</option>
          <option value="none">Ingen</option>
        </Select>
      </Field>
      <Check label="Tilfeldig rekkefølge" checked={!!c.shuffle} onChange={(v) => set({ shuffle: v })} />
    </div>
  );
}

/** Stedssøk (Kartverket) for vær-widgeten. */
export function PlaceSearch({ value, onPick, placeholder }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const t = setTimeout(() => {
      fetch(`/api/feeds?type=places&q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => setHits(Array.isArray(rows) ? rows : []))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="grid gap-1.5">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || (value ? `Valgt: ${value} – søk for å bytte` : 'Søk sted, f.eks. Ålesund')} />
      {hits.length > 0 && (
        <ul className="m-0 max-h-48 list-none overflow-y-auto rounded-xl border border-line bg-card p-1">
          {hits.map((h, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onPick(h);
                  setQ('');
                  setHits([]);
                }}
                className="flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zone"
              >
                <span className="font-semibold text-ink">{h.name}</span>
                <span className="truncate text-xs text-muted">
                  {[h.type, h.municipality].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const Check = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 text-sm text-ink">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 rounded border-line text-brand"
    />
    {label}
  </label>
);

/** Type-spesifikke felter for et canvas-element. `cfg` = element.config, `set(patch)`. */
export default function ElementConfigFields({ kind, cfg, set, categories = [] }) {
  const c = cfg || {};

  if (kind === 'text') {
    const fill = c.fill && c.fill.type === 'gradient' ? c.fill : null;
    return (
      <div className="grid gap-3">
        <Field label="Tekst">
          <Textarea rows={3} value={c.text || ''} onChange={(e) => set({ text: e.target.value })} />
        </Field>
        <Check label="Krymp teksten så den får plass i boksen" checked={c.autoFit !== false} onChange={(v) => set({ autoFit: v })} />

        <Field label="Font">
          <Select value={c.font || ''} onChange={(e) => set({ font: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Vekt">
            <Select value={c.weight ?? 700} onChange={(e) => set({ weight: Number(e.target.value) })}>
              {FONT_WEIGHTS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Størrelse (px)">
            <Input
              type="number"
              min={8}
              value={c.size ?? 64}
              onChange={(e) => set({ size: Number(e.target.value) || 64 })}
            />
          </Field>
        </div>

        <ButtonGroup
          items={[
            { key: 'b', label: 'B', title: 'Fet', active: (c.weight ?? 700) >= 700, onClick: () => set({ weight: (c.weight ?? 700) >= 700 ? 400 : 700 }) },
            { key: 'i', label: <span className="italic">I</span>, title: 'Kursiv', active: !!c.italic, onClick: () => set({ italic: !c.italic }) },
            { key: 'u', label: <span className="underline">U</span>, title: 'Understrek', active: !!c.underline, onClick: () => set({ underline: !c.underline }) },
            { key: 's', label: <span className="line-through">S</span>, title: 'Gjennomstrek', active: !!c.strike, onClick: () => set({ strike: !c.strike }) },
            { key: 'sh', icon: 'shadow', title: 'Skygge', active: !!c.shadow, onClick: () => set({ shadow: !c.shadow }) }
          ]}
        />

        <Field label="Fyll">
          <Segmented
            value={fill ? 'gradient' : 'solid'}
            onChange={(v) =>
              set(
                v === 'gradient'
                  ? { fill: { type: 'gradient', from: c.color || '#3b82f6', to: '#ec4899', angle: 294 } }
                  : { fill: null }
              )
            }
            options={[
              { value: 'solid', label: 'Ensfarget' },
              { value: 'gradient', label: 'Forløpning' }
            ]}
          />
          {fill ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ColorInput value={fill.from} onChange={(e) => set({ fill: { ...fill, from: e.target.value } })} />
              <ColorInput value={fill.to} onChange={(e) => set({ fill: { ...fill, to: e.target.value } })} />
              <label className="col-span-2 flex items-center gap-2 text-xs text-muted">
                Vinkel °
                <Input
                  type="number"
                  className="flex-1"
                  value={fill.angle ?? 294}
                  onChange={(e) => set({ fill: { ...fill, angle: Number(e.target.value) || 0 } })}
                />
              </label>
            </div>
          ) : (
            <ColorInput
              className="mt-2"
              value={c.color || '#ffffff'}
              onChange={(e) => set({ color: e.target.value })}
            />
          )}
        </Field>

        <Field label="Justering">
          <Segmented
            value={c.align || 'left'}
            onChange={(v) => set({ align: v })}
            options={[
              { value: 'left', icon: 'alignLeft' },
              { value: 'center', icon: 'alignCenter' },
              { value: 'right', icon: 'alignRight' },
              { value: 'justify', icon: 'alignJustify' }
            ]}
          />
          <Segmented
            className="mt-1.5"
            value={c.valign || 'top'}
            onChange={(v) => set({ valign: v })}
            options={[
              { value: 'top', label: 'Topp' },
              { value: 'middle', label: 'Midt' },
              { value: 'bottom', label: 'Bunn' }
            ]}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Linjeavstand">
            <Input
              type="number"
              step="0.05"
              min={0.7}
              value={c.lineHeight ?? 1.1}
              onChange={(e) => set({ lineHeight: Number(e.target.value) || 1.1 })}
            />
          </Field>
          <Field label="Tegnavstand (px)">
            <Input
              type="number"
              step="0.5"
              value={c.tracking ?? 0}
              onChange={(e) => set({ tracking: Number(e.target.value) || 0 })}
            />
          </Field>
        </div>
      </div>
    );
  }

  if (kind === 'image') {
    return (
      <div className="grid gap-3">
        <MediaField value={c.url} onChange={(url) => set({ url })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tilpasning">
            <Select value={c.fit || 'contain'} onChange={(e) => set({ fit: e.target.value })}>
              <option value="contain">Vis hele bildet</option>
              <option value="cover">Fyll flaten</option>
            </Select>
          </Field>
          <Field label="Hjørnerundng (px)">
            <Input
              type="number"
              min={0}
              value={c.radius ?? 0}
              onChange={(e) => set({ radius: Number(e.target.value) || 0 })}
            />
          </Field>
        </div>
      </div>
    );
  }

  if (kind === 'shape') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Form">
          <Select value={c.shape || 'rect'} onChange={(e) => set({ shape: e.target.value })}>
            <option value="rect">Rektangel</option>
            <option value="ellipse">Ellipse</option>
            <option value="triangle">Trekant</option>
          </Select>
        </Field>
        <Field label="Farge">
          <ColorInput value={c.fill || '#1f5566'} onChange={(e) => set({ fill: e.target.value })} />
        </Field>
        <Field label="Hjørnerundng (px)">
          <Input
            type="number"
            min={0}
            value={c.radius ?? 16}
            onChange={(e) => set({ radius: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Gjennomsiktighet (%)">
          <Input
            type="number"
            min={0}
            max={100}
            value={c.opacity ?? 100}
            onChange={(e) => set({ opacity: Number(e.target.value) })}
          />
        </Field>
      </div>
    );
  }

  if (kind === 'clock') {
    return (
      <div className="flex flex-col gap-2">
        <Check label="Vis dato" checked={c.showDate !== false} onChange={(v) => set({ showDate: v })} />
        <Check
          label="Vis sekunder"
          checked={c.showSeconds !== false}
          onChange={(v) => set({ showSeconds: v })}
        />
        <Check label="Vis ramme" checked={c.frame === true} onChange={(v) => set({ frame: v })} />
      </div>
    );
  }

  if (kind === 'countdown') {
    return (
      <div className="grid gap-3">
        <Field label="Mål">
          <Select value={c.mode || 'nextItem'} onChange={(e) => set({ mode: e.target.value })}>
            <option value="fixed">Fast tidspunkt</option>
            <option value="nextItem">Neste programpost</option>
          </Select>
        </Field>
        {c.mode !== 'nextItem' && (
          <Field label="Tidspunkt">
            <Input
              type="datetime-local"
              value={c.target ? isoToLocalInput(c.target) : ''}
              onChange={(e) => set({ target: e.target.value ? localInputToIso(e.target.value) : '' })}
            />
          </Field>
        )}
        <Field label="Overskrift">
          <Input value={c.title || ''} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Tekst når ferdig">
          <Input value={c.doneText || ''} onChange={(e) => set({ doneText: e.target.value })} />
        </Field>
        <Field label="Bakgrunn">
          <Select value={c.emphasis || 'info'} onChange={(e) => set({ emphasis: e.target.value })}>
            {MESSAGE_EMPHASIS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    );
  }

  if (kind === 'program') {
    const catIds = Array.isArray(c.categoryIds) ? c.categoryIds : [];
    const toggle = (id) =>
      set({ categoryIds: catIds.includes(id) ? catIds.filter((x) => x !== id) : [...catIds, id] });
    return (
      <div className="grid gap-3">
        <Field label="Visning">
          <Select value={c.mode || 'agenda'} onChange={(e) => set({ mode: e.target.value })}>
            {PROGRAM_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Maks poster">
            <Input
              type="number"
              min={1}
              value={c.max ?? 8}
              onChange={(e) => set({ max: Number(e.target.value) || 8 })}
            />
          </Field>
          <Field label="Kun scene">
            <Input
              value={c.stage || ''}
              onChange={(e) => set({ stage: e.target.value })}
              placeholder="Alle"
            />
          </Field>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">
            Kategorier (ingen = alle)
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => {
              const on = catIds.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggle(cat.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold ${
                    on ? 'border-transparent text-white' : 'border-line bg-card text-muted'
                  }`}
                  style={on ? { backgroundColor: cat.color } : undefined}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: on ? '#fff' : cat.color }}
                  />
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>
        <Check
          label="Vis kategori-merke"
          checked={c.showCategory !== false}
          onChange={(v) => set({ showCategory: v })}
        />
        <Check label="Vis ramme" checked={c.frame === true} onChange={(v) => set({ frame: v })} />
      </div>
    );
  }

  if (kind === 'qr') {
    return (
      <div className="grid gap-3">
        <Field label="Innhold">
          <Select value={c.mode || 'schedule'} onChange={(e) => set({ mode: e.target.value })}>
            <option value="url">Egendefinert lenke</option>
            <option value="schedule">Programside for denne skjermen</option>
          </Select>
        </Field>
        {c.mode !== 'schedule' && (
          <Field label="Lenke">
            <Input value={c.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" />
          </Field>
        )}
        <Field label="Overskrift">
          <Input value={c.label || ''} onChange={(e) => set({ label: e.target.value })} />
        </Field>
        <Field label="Undertekst">
          <Input value={c.caption || ''} onChange={(e) => set({ caption: e.target.value })} />
        </Field>
        <Check label="Vis ramme" checked={c.frame === true} onChange={(v) => set({ frame: v })} />
      </div>
    );
  }

  if (kind === 'video') {
    return (
      <div className="grid gap-3">
        <MediaField
          label="Video"
          kind="video"
          value={c.url}
          onChange={(url) => set({ url })}
          placeholder="YouTube/Vimeo-lenke, eller velg fra bibliotek"
        />
        <Field label="Tilpasning">
          <Select value={c.fit || 'contain'} onChange={(e) => set({ fit: e.target.value })}>
            <option value="contain">Vis hele</option>
            <option value="cover">Fyll flaten</option>
          </Select>
        </Field>
        <Check label="Løkke" checked={!!c.loop} onChange={(v) => set({ loop: v })} />
        <Check label="Uten lyd" checked={c.mute !== false} onChange={(v) => set({ mute: v })} />
      </div>
    );
  }

  if (kind === 'carousel') return <CarouselFields c={c} set={set} />;
  if (kind === 'app') return <AppFields c={c} set={set} />;

  if (kind === 'weather') {
    return (
      <div className="grid gap-3">
        <Field label="Sted" hint="Værdata fra MET Norway (yr.no).">
          <PlaceSearch value={c.place} onPick={(h) => set({ place: h.name, lat: h.lat, lon: h.lon })} />
        </Field>
        <Field label="Visning">
          <Select value={c.layout || 'now'} onChange={(e) => set({ layout: e.target.value })}>
            <option value="now">Været nå</option>
            <option value="hours">Neste timer</option>
            <option value="days">Neste dager</option>
          </Select>
        </Field>
        <Field label="Tekstfarge">
          <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
        </Field>
        <Check label="Vis ramme" checked={c.frame === true} onChange={(v) => set({ frame: v })} />
      </div>
    );
  }

  if (kind === 'rss') {
    const preset = RSS_PRESETS.find((p) => p.url === c.url);
    return (
      <div className="grid gap-3">
        <Field label="Kilde">
          <Select value={preset ? c.url : '__custom'} onChange={(e) => e.target.value !== '__custom' && set({ url: e.target.value })}>
            {RSS_PRESETS.map((p) => (
              <option key={p.url} value={p.url}>
                {p.label}
              </option>
            ))}
            <option value="__custom">Egen RSS-adresse …</option>
          </Select>
        </Field>
        {!preset && (
          <Field label="RSS-adresse">
            <Input value={c.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://…/rss" />
          </Field>
        )}
        <Field label="Visning">
          <Select value={c.mode || 'ticker'} onChange={(e) => set({ mode: e.target.value })}>
            <option value="ticker">Rullende linje</option>
            <option value="single">Én sak av gangen</option>
            <option value="list">Liste med overskrifter</option>
          </Select>
        </Field>
        {(c.mode || 'ticker') === 'ticker' && (
          <Field label="Fart">
            <Select value={c.speed || 60} onChange={(e) => set({ speed: Number(e.target.value) })}>
              <option value={35}>Rolig</option>
              <option value={60}>Normal</option>
              <option value={100}>Rask</option>
            </Select>
          </Field>
        )}
        <Field label="Antall saker">
          <Input type="number" min={1} max={30} value={c.max ?? 10} onChange={(e) => set({ max: Number(e.target.value) || 10 })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tekst">
            <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
          </Field>
          <Field label="Bakgrunn">
            <ColorInput
              value={/^#/.test(c.background || '') ? c.background : '#000000'}
              onChange={(e) => set({ background: e.target.value })}
            />
          </Field>
        </div>
        <Check label="Vis kildenavn" checked={c.showSource !== false} onChange={(v) => set({ showSource: v })} />
      </div>
    );
  }

  if (kind === 'calendar') {
    return (
      <div className="grid gap-3">
        <Field
          label="Kalenderadresse (.ics)"
          hint="Google: Innstillinger → kalenderen → «Hemmelig adresse i iCal-format». Outlook: Kalender → Del → Publiser → ICS-lenke."
        >
          <Input value={c.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://calendar.google.com/…/basic.ics" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Antall hendelser">
            <Input type="number" min={1} max={20} value={c.max ?? 6} onChange={(e) => set({ max: Number(e.target.value) || 6 })} />
          </Field>
          <Field label="Dager fram">
            <Input type="number" min={1} max={90} value={c.days ?? 14} onChange={(e) => set({ days: Number(e.target.value) || 14 })} />
          </Field>
        </div>
        <Field label="Tekstfarge">
          <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
        </Field>
        <Check label="Vis sted" checked={c.showLocation !== false} onChange={(v) => set({ showLocation: v })} />
        <Check label="Vis ramme" checked={c.frame === true} onChange={(v) => set({ frame: v })} />
      </div>
    );
  }

  if (kind === 'web') {
    return (
      <div className="grid gap-3">
        <Field label="Nettside-URL" hint="Noen sider blokkerer innramming.">
          <Input value={c.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" />
        </Field>
        <Field label="Oppdater hvert (min, 0 = aldri)">
          <Input
            type="number"
            min={0}
            value={c.refreshMinutes ?? 0}
            onChange={(e) => set({ refreshMinutes: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
    );
  }

  if (kind === 'sponsors') {
    return <p className="text-sm text-muted">Viser alle sponsorer, én om gangen i sin egen varighet.</p>;
  }

  return null;
}
