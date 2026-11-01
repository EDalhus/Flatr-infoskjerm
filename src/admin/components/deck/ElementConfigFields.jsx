import { PROGRAM_MODES, MESSAGE_EMPHASIS } from '../../../lib/slides.js';
import { FONTS, FONT_WEIGHTS } from '../../../lib/deck.js';
import { isoToLocalInput, localInputToIso } from '../../../lib/time.js';
import { Field, Input, Select, Textarea, Segmented, ButtonGroup, ColorInput, Button, Icon } from '../ui.jsx';
import { MediaField } from '../MediaPicker.jsx';
import { STOCK_GROUPS } from '../../../lib/stock.js';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import { MODES as ENTUR_MODES } from '../../../lib/entur.js';
import { CropModal, FocusPicker, saveCropped } from './ImageTools.jsx';
import { activeRich } from '../../../lib/richText.js';
import { columnNames } from '../../../viewer/slides/SheetView.jsx';
import { tr } from '../../../lib/i18n.js';

const RSS_PRESETS = [
  { label: tr('NRK – Toppsaker'), url: 'https://www.nrk.no/toppsaker.rss' },
  { label: tr('NRK Møre og Romsdal'), url: 'https://www.nrk.no/mr/toppsaker.rss' },
  { label: tr('NRK Sport'), url: 'https://www.nrk.no/sport/toppsaker.rss' },
  { label: tr('VG'), url: 'https://www.vg.no/rss/feed' },
  { label: tr('E24'), url: 'https://e24.no/rss2/' },
  { label: tr('Teknisk Ukeblad'), url: 'https://www.tu.no/rss' }
];

/** Innstillinger for Flatr App: hvilken app, visning, båter og kai. */
function AppFields({ c, set }) {
  const [apps, setApps] = useState(null);
  useEffect(() => {
    api.apps
      .list()
      .then((rows) => setApps((rows || []).filter((a) => ['ais', 'custom', 'birthdays', 'menu', 'tides', 'football', 'fixtures', 'stock', 'entur', 'sheet', 'poll'].includes(a.kind))))
      .catch(() => setApps([]));
  }, []);
  const app = (apps || []).find((a) => a.id === c.appId);
  const isCustom = app?.kind === 'custom';
  const isBirthdays = app?.kind === 'birthdays';
  const isOther = ['menu', 'tides', 'football', 'fixtures', 'stock', 'entur', 'sheet', 'poll'].includes(app?.kind);
  // Avstemning: hvilke avstemninger som finnes.
  const [polls, setPolls] = useState(null);
  useEffect(() => {
    if (app?.kind !== 'poll') return;
    api.polls
      .list()
      .then((d) => setPolls(d.polls || []))
      .catch(() => setPolls([]));
  }, [app?.id, app?.kind]);
  // Regneark: kolonnenavnene til valgene under (fra siste henting).
  const [sheetData, setSheetData] = useState(null);
  useEffect(() => {
    if (app?.kind !== 'sheet') return;
    api.apps.live(app.id).then(setSheetData).catch(() => setSheetData(null));
  }, [app?.id, app?.kind]);
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
      <Field label={tr('App')}>
        <Select value={c.appId ?? ''} onChange={(e) => set({ appId: Number(e.target.value) || null, mmsi: [], quayId: '' })}>
          <option value="">{tr('Velg app …')}</option>
          {(apps || []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      {apps && apps.length === 0 && (
        <p className="m-0 text-xs text-muted">
          {tr('Du har ingen aktiverte apper med data ennå. Finn dem i')}{' '}
          <a href="/admin?view=apps" className="font-semibold text-brand hover:underline">
            Flatr Apps
          </a>
          .
        </p>
      )}
      {isCustom && (
        <>
          <p className="m-0 text-xs text-muted">{tr('Visningen bestemmes av appen. Innstillingene finner du under Flatr Apps.')}</p>
          <Field label={tr('Tekstfarge')}>
            <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
          </Field>
          <Check label={tr('Vis ramme')} checked={c.frame === true} onChange={(v) => set({ frame: v })} />
        </>
      )}
      {isBirthdays && c.effect === 'rain' && (
        <>
          <Field label={tr('Mengde')}>
            <Segmented
              value={c.amount || 'normal'}
              onChange={(v) => set({ amount: v })}
              options={[
                { value: 'few', label: tr('Litt') },
                { value: 'normal', label: tr('Normalt') },
                { value: 'many', label: tr('Mye') }
              ]}
            />
          </Field>
          <Field label={tr('Synlighet')}>
            <span className="flex items-center gap-2">
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={c.opacity ?? 1}
                onChange={(e) => set({ opacity: Number(e.target.value) })}
                className="flex-1 accent-brand"
                aria-label={tr('Synlighet')}
              />
              <span className="w-10 text-right text-xs tabular-nums text-muted">{Math.round((c.opacity ?? 1) * 100)} %</span>
            </span>
          </Field>
          <p className="m-0 text-xs text-muted">
            {tr('Kaker og konfetti regner over dette laget på dager der noen har bursdag – ellers er det usynlig. Legg det fremst og gjør det så stort du vil.')}
          </p>
        </>
      )}
      {isBirthdays && c.effect !== 'rain' && (
        <>
          <Field label={tr('Overskrift')}>
            <Input value={c.title ?? 'Bursdager'} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label={tr('Vis bursdager')} hint={tr('Alle som har bursdag i dag og så mange dager fram i tid.')}>
            <Select value={c.days ?? ''} onChange={(e) => set({ days: Number(e.target.value) })}>
              {c.days == null && <option value="">{tr('De')} {c.count ?? 3} {tr('neste (gammel innstilling)')}</option>}
              <option value={1}>{tr('I dag og i morgen')}</option>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} {tr('dager fram i tid')}
                </option>
              ))}
              <option value={7}>{tr('7 dager fram i tid (en uke)')}</option>
            </Select>
          </Field>
          {c.days != null && (
            <Check label={tr('Skjul boksen når ingen har bursdag i perioden')} checked={c.autoHide !== false} onChange={(v) => set({ autoHide: v })} />
          )}
          <Field label={tr('Plassering i boksen')} hint={tr('Gjelder når det er få bursdager og det blir ledig plass.')}>
            <Segmented
              value={c.valign || 'top'}
              onChange={(v) => set({ valign: v })}
              options={[
                { value: 'top', label: tr('Topp') },
                { value: 'middle', label: tr('Midt') },
                { value: 'bottom', label: tr('Bunn') }
              ]}
            />
          </Field>
          <Field label={tr('Tekstfarge')}>
            <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
          </Field>
          <Check label={tr('Vis ramme')} checked={c.frame !== false} onChange={(v) => set({ frame: v })} />
          <p className="m-0 text-xs text-muted">{tr('Personer og fødselsdatoer legger du inn under Flatr Apps → Bursdager.')}</p>
        </>
      )}
      {app?.kind === 'menu' && (
        <>
          <Field label={tr('Visning')}>
            <Segmented value={c.menuView || 'today'} onChange={(v) => set({ menuView: v })} options={[{ value: 'today', label: tr('Dagens meny') }, { value: 'week', label: tr('Hele uka') }]} />
          </Field>
          <Field label={tr('Overskrift')}>
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder={c.menuView === 'week' ? tr('Ukens meny') : tr('Dagens meny')} />
          </Field>
          <Check label={tr('Vis priser')} checked={c.showPrice !== false} onChange={(v) => set({ showPrice: v })} />
          <Check label={tr('Vis merking (allergener, vegetar …)')} checked={c.showTags !== false} onChange={(v) => set({ showTags: v })} />
        </>
      )}
      {app?.kind === 'stock' && (
        <>
          <Field label={tr('Overskrift')}>
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder={app.config?.title || tr('Lagerbeholdning')} />
          </Field>
          <Field label={tr('Vis gruppene')} hint={tr('Ingen valgt = alle. Nyttig når hver gruppe skal på sin egen skjerm.')}>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {STOCK_GROUPS.map((g) => (
                <Check
                  key={g.id}
                  label={g.label}
                  checked={(c.groups || []).includes(g.id)}
                  onChange={(v) => set({ groups: v ? [...new Set([...(c.groups || []), g.id])] : (c.groups || []).filter((x) => x !== g.id) })}
                />
              ))}
            </div>
          </Field>
          <Check label={tr('Vis detaljer (silo, lagerplass …)')} checked={c.showDetails !== false} onChange={(v) => set({ showDetails: v })} />
          <Check label={tr('Vis når den sist ble oppdatert')} checked={c.showUpdated !== false} onChange={(v) => set({ showUpdated: v })} />
          <p className="m-0 text-xs text-muted">{tr('Varer og mengder skriver du inn under Flatr Apps → Lagerbeholdning.')}</p>
        </>
      )}
      {app?.kind === 'tides' && (
        <>
          <Field label={tr('Sted')} hint={(app.config?.places || []).length ? null : tr('Legg inn steder under Flatr Apps → Tidevann og sjø.')}>
            <Select value={c.placeId || ''} onChange={(e) => set({ placeId: e.target.value })}>
              {(app.config?.places || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr('Vis')}>
            <Segmented value={c.tideView || 'both'} onChange={(v) => set({ tideView: v })} options={[{ value: 'tide', label: tr('Tidevann') }, { value: 'sea', label: tr('Sjø') }, { value: 'both', label: tr('Begge') }]} />
          </Field>
        </>
      )}
      {app?.kind === 'fixtures' && (
        <>
          <Field label={tr('Visning')}>
            <Segmented value={c.fixturesView || 'list'} onChange={(v) => set({ fixturesView: v })} options={[{ value: 'list', label: tr('Neste kamper') }, { value: 'next', label: tr('Neste kamp, stor') }]} />
          </Field>
          <Field label={tr('Lag')} hint={(app.config?.teams || []).length ? tr('Ingen valgt = alle lagene.') : tr('Legg til lag under Flatr Apps → Kampprogram.')}>
            <div className="flex flex-wrap gap-1.5">
              {(app.config?.teams || []).map((t) => {
                const on = (c.teams || []).includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ teams: on ? (c.teams || []).filter((x) => x !== t.id) : [...(c.teams || []), t.id] })}
                    className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors ${on ? 'bg-ink text-paper' : 'border border-line bg-card text-muted hover:text-ink'}`}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <Check label={tr('Bare hjemmekamper')} checked={!!c.homeOnly} onChange={(v) => set({ homeOnly: v })} />
          {(c.fixturesView || 'list') === 'list' && (
            <Field label={tr('Antall kamper')}>
              <Input type="number" min={1} max={12} value={c.max ?? 6} onChange={(e) => set({ max: Number(e.target.value) || undefined })} />
            </Field>
          )}
          <Field label={tr('Overskrift (valgfritt)')}>
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
        </>
      )}
      {app?.kind === 'poll' && (
        <>
          <Field label={tr('Avstemning')} hint={polls && !polls.length ? tr('Lag en avstemning under Flatr Apps → Avstemning.') : null}>
            <Select value={c.pollId ?? ''} onChange={(e) => set({ pollId: Number(e.target.value) || null })}>
              <option value="">{tr('Den nyeste åpne')}</option>
              {(polls || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.question}
                  {p.status === 'closed' ? ' (lukket)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr('Visning')}>
            <Segmented value={c.pollView || 'results'} onChange={(v) => set({ pollView: v })} options={[{ value: 'results', label: tr('Med resultater') }, { value: 'qr', label: tr('Bare QR-kode') }]} />
          </Field>
          <Field label={tr('Overskrift (valgfritt)')} hint={tr('Står det tomt, vises spørsmålet.')}>
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
        </>
      )}
      {app?.kind === 'sheet' && (() => {
        const sheets = app.config?.sheets || [];
        const sheet = sheets.find((s) => s.id === c.sheetId) || sheets[0];
        const rows = sheetData?.sheets?.[sheet?.id]?.rows || [];
        const names = columnNames(rows, c.header !== false);
        const view = c.sheetView || 'table';
        return (
          <>
            <Field label={tr('Regneark')} hint={sheets.length ? null : tr('Legg til regneark under Flatr Apps → Regneark.')}>
              <Select value={sheet?.id || ''} onChange={(e) => set({ sheetId: e.target.value, columns: [] })}>
                {sheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr('Visning')}>
              <Segmented value={view} onChange={(v) => set({ sheetView: v })} options={[{ value: 'table', label: tr('Tabell') }, { value: 'value', label: tr('Nøkkeltall') }, { value: 'list', label: tr('Liste') }]} />
            </Field>
            {view !== 'value' && <Check label={tr('Første rad er overskrifter')} checked={c.header !== false} onChange={(v) => set({ header: v })} />}
            {view === 'table' && names.length > 0 && (
              <Field label={tr('Kolonner')} hint={tr('Ingen valgt = de åtte første.')}>
                <div className="flex flex-wrap gap-1.5">
                  {names.map((n, i) => {
                    const on = (c.columns || []).includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ columns: on ? (c.columns || []).filter((x) => x !== i) : [...(c.columns || []), i].sort((a, b) => a - b) })}
                        className={`h-8 max-w-[12rem] truncate rounded-full px-3 text-xs font-semibold transition-colors ${on ? 'bg-ink text-paper' : 'border border-line bg-card text-muted hover:text-ink'}`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
            {view === 'list' && names.length > 0 && (
              <Field label={tr('Kolonne')}>
                <Select value={c.column ?? 0} onChange={(e) => set({ column: Number(e.target.value) })}>
                  {names.map((n, i) => (
                    <option key={i} value={i}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {view === 'value' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={tr('Celle')} hint={tr('F.eks. B2')}>
                  <Input value={c.cell ?? 'B2'} onChange={(e) => set({ cell: e.target.value.toUpperCase().slice(0, 6) })} />
                </Field>
                <Field label={tr('Tekst over tallet')}>
                  <Input value={c.label ?? ''} onChange={(e) => set({ label: e.target.value })} />
                </Field>
              </div>
            ) : (
              <Field label={tr('Antall rader')}>
                <Input type="number" min={1} max={30} value={c.max ?? 10} onChange={(e) => set({ max: Number(e.target.value) || undefined })} />
              </Field>
            )}
            <Field label={tr('Overskrift (valgfritt)')}>
              <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
            </Field>
          </>
        );
      })()}
      {app?.kind === 'entur' && (
        <>
          <Field label={tr('Holdeplass')} hint={(app.config?.stops || []).length ? null : tr('Legg til holdeplasser under Flatr Apps → Avganger.')}>
            <Select value={c.stopId || ''} onChange={(e) => set({ stopId: e.target.value })}>
              {(app.config?.stops || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr('Transportmidler')} hint={tr('Ingen valgt = alle.')}>
            <div className="flex flex-wrap gap-1.5">
              {ENTUR_MODES.map((m) => {
                const on = (c.modes || []).includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ modes: on ? (c.modes || []).filter((x) => x !== m.id) : [...(c.modes || []), m.id] })}
                    className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors ${on ? 'bg-ink text-paper' : 'border border-line bg-card text-muted hover:text-ink'}`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr('Gangtid (min)')} hint={tr('Skjuler avganger folk ikke rekker.')}>
              <Input type="number" min={0} max={30} value={c.walkMinutes ?? 0} onChange={(e) => set({ walkMinutes: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
            <Field label={tr('Antall avganger')}>
              <Input type="number" min={1} max={20} value={c.max ?? 8} onChange={(e) => set({ max: Number(e.target.value) || undefined })} />
            </Field>
          </div>
          <Check label={tr('Vis plattform og spor')} checked={c.showPlatform !== false} onChange={(v) => set({ showPlatform: v })} />
          <Field label={tr('Overskrift (valgfritt)')} hint={tr('Står det tomt, brukes navnet på holdeplassen.')}>
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
        </>
      )}
      {app?.kind === 'football' && (
        <>
          <Field label={tr('Visning')}>
            <Segmented value={c.footballView || 'next'} onChange={(v) => set({ footballView: v })} options={[{ value: 'next', label: tr('Neste') }, { value: 'last', label: tr('Resultater') }, { value: 'table', label: tr('Tabell') }]} />
          </Field>
          {(c.footballView || 'next') === 'table' ? (
            <Field label={tr('Liga')} hint={(app.config?.leagues || []).length ? null : tr('Legg til ligaer under Flatr Apps → Fotball.')}>
              <Select value={c.leagueId || ''} onChange={(e) => set({ leagueId: Number(e.target.value) })}>
                {(app.config?.leagues || []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label={tr('Lag')} hint={(app.config?.teams || []).length ? null : tr('Legg til lag under Flatr Apps → Fotball.')}>
              <Select value={c.teamId || ''} onChange={(e) => set({ teamId: Number(e.target.value) })}>
                {(app.config?.teams || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={tr('Antall')}>
            <Input type="number" min={3} max={20} value={c.max ?? ((c.footballView || 'next') === 'table' ? 16 : 5)} onChange={(e) => set({ max: Number(e.target.value) || undefined })} />
          </Field>
          <Field label={tr('Overskrift (valgfritt)')}>
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
        </>
      )}
      {isOther && (
        <>
          <Field label={tr('Tekstfarge')}>
            <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
          </Field>
          <Check label={tr('Vis ramme')} checked={c.frame !== false} onChange={(v) => set({ frame: v })} />
        </>
      )}
      {app && !isCustom && !isBirthdays && !isOther && (
        <>
          <Field label={tr('Visning')}>
            <Select value={view} onChange={(e) => set({ view: e.target.value })}>
              <option value="map">{tr('Kart')}</option>
              <option value="cards">{tr('Båtkort')}</option>
              <option value="arrivals">{tr('Ankomsttavle')}</option>
              <option value="calls">{tr('Anløpsplan (med varer)')}</option>
            </Select>
          </Field>
          {view === 'calls' && (
            <>
              <Field label={tr('Overskrift')}>
                <Input value={c.title ?? tr('Anløp')} onChange={(e) => set({ title: e.target.value })} />
              </Field>
              <Field label={tr('Vis anløp')} hint={tr('Anløpene legger du inn under Flatr Apps → NAIS → Anløp.')}>
                <Select value={c.callDays ?? 7} onChange={(e) => set({ callDays: Number(e.target.value) })}>
                  {[1, 2, 3, 7, 14, 30].map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? tr('I dag og i morgen') : tr('De neste {0} dagene', [n])}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {view === 'map' && (
            <Field label={tr('Kartstil')}>
              <Select value={c.mapStyle || 'nautical'} onChange={(e) => set({ mapStyle: e.target.value })}>
                <option value="nautical">{tr('Mørkt (som Kystverket)')}</option>
                <option value="light">{tr('Lyst kart')}</option>
              </Select>
            </Field>
          )}
          <Field label={tr('Farge på båtene')}>
            <Select value={c.colorBy || 'type'} onChange={(e) => set({ colorBy: e.target.value })}>
              <option value="type">{tr('Etter skipstype (standard på AIS-kart)')}</option>
              <option value="own">{tr('Flåtens egne farger')}</option>
            </Select>
          </Field>
          {view === 'map' && (
            <Field label={tr('Utsnitt')}>
              <Select value={c.area || 'fleet'} onChange={(e) => set({ area: e.target.value })}>
                <option value="fleet">{tr('Zoom til båtene')}</option>
                <option value="norway">{tr('Hele Norge')}</option>
              </Select>
            </Field>
          )}
          <Field
            label={view === 'map' ? tr('Kai (valgfritt)') : view === 'arrivals' ? tr('Kai') : view === 'calls' ? tr('Kai (tom = alle kaier)') : tr('Vis ETA til kai')}
            hint={quays.length ? null : tr('Legg inn kaier i appen for å få ETA.')}
          >
            <Select value={c.quayId || ''} onChange={(e) => set({ quayId: e.target.value })}>
              <option value="">{view === 'map' || view === 'calls' ? tr('Alle kaier') : tr('Ingen')}</option>
              {quays.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </Select>
          </Field>
          {groupNames.length > 0 && (
            <Field label={tr('Grupper')} hint={pickedGroups.size ? tr('Bare båter i de valgte gruppene vises.') : tr('Ingen valgt = alle grupper')}>
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
                      {g || tr('Uten gruppe')}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
          {view !== 'calls' && (
          <Field label={tr('Båter')} hint={picked.size ? tr('{0} valgt', [picked.size]) : pickedGroups.size ? tr('Ingen valgt = alle i gruppene') : tr('Ingen valgt = hele flåten')}>
            <div className="grid max-h-48 gap-1 overflow-y-auto">
              {fleet.filter((b) => !pickedGroups.size || pickedGroups.has(b.group || '')).map((b) => (
                <Check key={b.mmsi} label={b.name} checked={picked.has(String(b.mmsi))} onChange={() => toggle(String(b.mmsi))} />
              ))}
              {!fleet.length && <span className="text-xs text-muted">{tr('Flåten er tom.')}</span>}
            </div>
          </Field>
          )}
          {view === 'map' ? (
            <>
              <Check label={tr('Vis navn på kartet')} checked={c.labels !== false} onChange={(v) => set({ labels: v })} />
              {(c.colorBy || 'type') === 'type' && (
                <Check label={tr('Vis fargeforklaring')} checked={c.legend !== false} onChange={(v) => set({ legend: v })} />
              )}
            </>
          ) : (
            <>
              <Field label={tr('Tekstfarge')}>
                <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
              </Field>
              <Check label={tr('Vis ramme')} checked={c.frame === true} onChange={(v) => set({ frame: v })} />
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
      <Field label={tr('Mappe')} hint={tr('Karusellen viser alle bildene i mappen. Legg til eller fjern bilder i mediebiblioteket.')}>
        <Select value={c.folder || ''} onChange={(e) => set({ folder: e.target.value })}>
          <option value="">{tr('Velg mappe …')}</option>
          {(folders || []).map(([name, n]) => (
            <option key={name} value={name}>
              {name} ({n} {n === 1 ? 'bilde' : 'bilder'})
            </option>
          ))}
          {c.folder && folders && !folders.some(([n]) => n === c.folder) && <option value={c.folder}>{c.folder} {tr('(tom)')}</option>}
        </Select>
      </Field>
      {folders && folders.length === 0 && (
        <p className="m-0 text-xs text-muted">
          {tr('Du har ingen mapper med bilder ennå. Lag en i')}{' '}
          <a href="/admin?view=media" className="font-semibold text-brand hover:underline">
            {tr('mediebiblioteket')}
          </a>
          .
        </p>
      )}
      <Field label={tr('Sekunder pr. bilde')}>
        <Input type="number" min={2} max={600} value={c.seconds ?? 8} onChange={(e) => set({ seconds: Number(e.target.value) || 8 })} />
      </Field>
      <Field label={tr('Tilpasning')}>
        <Select value={c.fit || 'contain'} onChange={(e) => set({ fit: e.target.value })}>
          <option value="contain">{tr('Vis hele bildet')}</option>
          <option value="cover">{tr('Fyll flaten')}</option>
        </Select>
      </Field>
      <Field label={tr('Overgang')}>
        <Select value={c.transition || 'fade'} onChange={(e) => set({ transition: e.target.value })}>
          <option value="fade">{tr('Ton over')}</option>
          <option value="none">{tr('Ingen')}</option>
        </Select>
      </Field>
      <Check label={tr('Tilfeldig rekkefølge')} checked={!!c.shuffle} onChange={(v) => set({ shuffle: v })} />
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
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || (value ? tr('Valgt: {0} – søk for å bytte', [value]) : tr('Søk sted, f.eks. Ålesund'))} />
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
/** Bilde: velg fra biblioteket, beskjær og roter, tilpasning og fokuspunkt. */
function ImageFields({ c, set, boxRatio }) {
  const [cropping, setCropping] = useState(false);
  const original = c.original?.url || c.url;
  return (
    <div className="grid gap-3">
      <MediaField value={c.url} onChange={(url) => set({ url, original: null, focus: null })} />
      {c.url && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCropping(true)}>
            <Icon name="crop" className="h-3.5 w-3.5" />
            {tr('Beskjær og roter')}
          </Button>
          {c.original && (
            <button type="button" onClick={() => set({ url: c.original.url, original: null, focus: null })} className="text-xs font-semibold text-muted hover:text-ink">
              {tr('Bruk originalen')}
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr('Tilpasning')}>
          <Select value={c.fit || 'contain'} onChange={(e) => set({ fit: e.target.value })}>
            <option value="contain">{tr('Vis hele bildet')}</option>
            <option value="cover">{tr('Fyll flaten')}</option>
          </Select>
        </Field>
        <Field label={tr('Hjørnerunding (px)')}>
          <Input type="number" min={0} value={c.radius ?? 0} onChange={(e) => set({ radius: Number(e.target.value) || 0 })} />
        </Field>
      </div>
      {c.url && c.fit === 'cover' && <FocusPicker url={c.url} value={c.focus} onChange={(focus) => set({ focus })} />}
      {cropping && (
        <CropModal
          src={original}
          initial={c.original}
          boxRatio={boxRatio}
          onClose={() => setCropping(false)}
          onDone={async (res) => {
            const url = await saveCropped(res, original);
            set({ url, original: { url: original, crop: res.crop, rotate: res.rotate }, focus: null });
            setCropping(false);
          }}
        />
      )}
    </div>
  );
}

export default function ElementConfigFields({ kind, cfg, set, categories = [], slides = [], boxRatio }) {
  const c = cfg || {};

  if (kind === 'button') {
    return (
      <div className="grid gap-3">
        <Field label={tr('Tekst på knappen')}>
          <Input value={c.label || ''} onChange={(e) => set({ label: e.target.value })} />
        </Field>
        <Field label={tr('Når noen trykker')}>
          <Select value={c.action || 'next'} onChange={(e) => set({ action: e.target.value })}>
            <option value="next">{tr('Gå til neste lysbilde')}</option>
            <option value="prev">{tr('Gå til forrige lysbilde')}</option>
            <option value="slide">{tr('Gå til et bestemt lysbilde')}</option>
            <option value="url">{tr('Vis en nettside')}</option>
          </Select>
        </Field>
        {c.action === 'slide' && (
          <Field label={tr('Lysbilde')}>
            <Select value={c.slideId || ''} onChange={(e) => set({ slideId: Number(e.target.value) || null })}>
              <option value="">{tr('Velg …')}</option>
              {slides.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {i + 1}. {s.name || tr('Lysbilde')}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {c.action === 'url' && (
          <Field label={tr('Nettside')} hint={tr('Vises over lysbildet med en Lukk-knapp. Noen nettsteder tillater ikke å bli vist slik.')}>
            <Input value={c.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label={tr('Knappefarge')}>
            <ColorInput value={c.fill || '#ffffff'} onChange={(e) => set({ fill: e.target.value })} />
          </Field>
          <Field label={tr('Tekstfarge')}>
            <ColorInput value={c.color || '#0f2733'} onChange={(e) => set({ color: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tr('Skriftstørrelse (px)')}>
            <Input type="number" min={16} max={200} value={c.size ?? 44} onChange={(e) => set({ size: Number(e.target.value) || 44 })} />
          </Field>
          <Field label={tr('Hjørner')}>
            <Select value={String(c.radius ?? 999)} onChange={(e) => set({ radius: Number(e.target.value) })}>
              <option value="999">{tr('Runde')}</option>
              <option value="24">{tr('Avrundet')}</option>
              <option value="0">{tr('Firkantet')}</option>
            </Select>
          </Field>
        </div>
        <p className="m-0 text-xs text-muted">
          {tr('Knapper virker på berøringsskjermer i nettleser. Når noen trykker eller sveiper, stopper automatisk bytte; etter 45 sekunder uten berøring går skjermen tilbake til første lysbilde. På Apple TV vises knappen bare som et merke.')}
        </p>
      </div>
    );
  }

  if (kind === 'text') {
    const fill = c.fill && c.fill.type === 'gradient' ? c.fill : null;
    return (
      <div className="grid gap-3">
        <Field
          label={tr('Tekst')}
          hint={
            activeRich(c)
              ? tr('Teksten har lister eller formatering. Dobbeltklikk teksten på lerretet for å endre den – endrer du den her, forsvinner formateringen.')
              : tr('Dobbeltklikk teksten på lerretet for punktlister og fet, kursiv eller farget skrift.')
          }
        >
          <Textarea rows={3} value={c.text || ''} onChange={(e) => set({ text: e.target.value, rich: null })} />
        </Field>
        <Check label={tr('Krymp teksten så den får plass i boksen')} checked={c.autoFit !== false} onChange={(v) => set({ autoFit: v })} />
        <Field label={tr('Navn for API (valgfritt)')} hint={tr('Gi teksten et navn, så kan egne systemer endre den med Flatr API (Konto → API).')}>
          <Input
            value={c.apiName ?? ''}
            placeholder="f.eks. dagens-tilbud"
            onChange={(e) =>
              set({
                apiName:
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, '-')
                    .replace(/^-+/, '')
                    .slice(0, 40) || null
              })
            }
          />
        </Field>

        <Field label={tr('Font')}>
          <Select value={c.font || ''} onChange={(e) => set({ font: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={tr('Vekt')}>
            <Select value={c.weight ?? 700} onChange={(e) => set({ weight: Number(e.target.value) })}>
              {FONT_WEIGHTS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr('Størrelse (px)')}>
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
            { key: 'b', label: tr('B'), title: tr('Fet'), active: (c.weight ?? 700) >= 700, onClick: () => set({ weight: (c.weight ?? 700) >= 700 ? 400 : 700 }) },
            { key: 'i', label: <span className="italic">{tr('I')}</span>, title: tr('Kursiv'), active: !!c.italic, onClick: () => set({ italic: !c.italic }) },
            { key: 'u', label: <span className="underline">{tr('U')}</span>, title: tr('Understrek'), active: !!c.underline, onClick: () => set({ underline: !c.underline }) },
            { key: 's', label: <span className="line-through">{tr('S')}</span>, title: tr('Gjennomstrek'), active: !!c.strike, onClick: () => set({ strike: !c.strike }) },
            { key: 'sh', icon: 'shadow', title: tr('Skygge'), active: !!c.shadow, onClick: () => set({ shadow: !c.shadow }) }
          ]}
        />

        <Field label={tr('Fyll')}>
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
              { value: 'solid', label: tr('Ensfarget') },
              { value: 'gradient', label: tr('Forløpning') }
            ]}
          />
          {fill ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ColorInput value={fill.from} onChange={(e) => set({ fill: { ...fill, from: e.target.value } })} />
              <ColorInput value={fill.to} onChange={(e) => set({ fill: { ...fill, to: e.target.value } })} />
              <label className="col-span-2 flex items-center gap-2 text-xs text-muted">
                {tr('Vinkel °')}
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

        <Field label={tr('Justering')}>
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
              { value: 'top', label: tr('Topp') },
              { value: 'middle', label: tr('Midt') },
              { value: 'bottom', label: tr('Bunn') }
            ]}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={tr('Linjeavstand')}>
            <Input
              type="number"
              step="0.05"
              min={0.7}
              value={c.lineHeight ?? 1.1}
              onChange={(e) => set({ lineHeight: Number(e.target.value) || 1.1 })}
            />
          </Field>
          <Field label={tr('Tegnavstand (px)')}>
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

  if (kind === 'image') return <ImageFields c={c} set={set} boxRatio={boxRatio} />;

  if (kind === 'shape') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr('Form')}>
          <Select value={c.shape || 'rect'} onChange={(e) => set({ shape: e.target.value })}>
            <option value="rect">{tr('Rektangel')}</option>
            <option value="ellipse">{tr('Ellipse')}</option>
            <option value="triangle">{tr('Trekant')}</option>
          </Select>
        </Field>
        <Field label={tr('Farge')}>
          <ColorInput value={c.fill || '#1f5566'} onChange={(e) => set({ fill: e.target.value })} />
        </Field>
        <Field label={tr('Hjørnerunding (px)')}>
          <Input
            type="number"
            min={0}
            value={c.radius ?? 16}
            onChange={(e) => set({ radius: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label={tr('Gjennomsiktighet (%)')}>
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
        <Check label={tr('Vis dato')} checked={c.showDate !== false} onChange={(v) => set({ showDate: v })} />
        <Check
          label={tr('Vis sekunder')}
          checked={c.showSeconds !== false}
          onChange={(v) => set({ showSeconds: v })}
        />
        <Check label={tr('Vis ramme')} checked={c.frame === true} onChange={(v) => set({ frame: v })} />
      </div>
    );
  }

  if (kind === 'countdown') {
    return (
      <div className="grid gap-3">
        <Field label={tr('Mål')}>
          <Select value={c.mode || 'nextItem'} onChange={(e) => set({ mode: e.target.value })}>
            <option value="fixed">{tr('Fast tidspunkt')}</option>
            <option value="nextItem">{tr('Neste programpost')}</option>
          </Select>
        </Field>
        {c.mode !== 'nextItem' && (
          <Field label={tr('Tidspunkt')}>
            <Input
              type="datetime-local"
              value={c.target ? isoToLocalInput(c.target) : ''}
              onChange={(e) => set({ target: e.target.value ? localInputToIso(e.target.value) : '' })}
            />
          </Field>
        )}
        <Field label={tr('Overskrift')}>
          <Input value={c.title || ''} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label={tr('Tekst når ferdig')}>
          <Input value={c.doneText || ''} onChange={(e) => set({ doneText: e.target.value })} />
        </Field>
        <Field label={tr('Bakgrunn')}>
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
        <Field label={tr('Visning')}>
          <Select value={c.mode || 'agenda'} onChange={(e) => set({ mode: e.target.value })}>
            {PROGRAM_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr('Maks poster')}>
            <Input
              type="number"
              min={1}
              value={c.max ?? 8}
              onChange={(e) => set({ max: Number(e.target.value) || 8 })}
            />
          </Field>
          <Field label={tr('Kun scene')}>
            <Input
              value={c.stage || ''}
              onChange={(e) => set({ stage: e.target.value })}
              placeholder={tr('Alle')}
            />
          </Field>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">
            {tr('Kategorier (ingen = alle)')}
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
          label={tr('Vis kategori-merke')}
          checked={c.showCategory !== false}
          onChange={(v) => set({ showCategory: v })}
        />
        <Check label={tr('Vis ramme')} checked={c.frame === true} onChange={(v) => set({ frame: v })} />
      </div>
    );
  }

  if (kind === 'qr') {
    return (
      <div className="grid gap-3">
        <Field label={tr('Innhold')}>
          <Select value={c.mode || 'schedule'} onChange={(e) => set({ mode: e.target.value })}>
            <option value="url">{tr('Egendefinert lenke')}</option>
            <option value="schedule">{tr('Programside for denne skjermen')}</option>
          </Select>
        </Field>
        {c.mode !== 'schedule' && (
          <Field label={tr('Lenke')}>
            <Input value={c.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" />
          </Field>
        )}
        <Field label={tr('Overskrift')}>
          <Input value={c.label || ''} onChange={(e) => set({ label: e.target.value })} />
        </Field>
        <Field label={tr('Undertekst')}>
          <Input value={c.caption || ''} onChange={(e) => set({ caption: e.target.value })} />
        </Field>
        <Check label={tr('Vis ramme')} checked={c.frame === true} onChange={(v) => set({ frame: v })} />
      </div>
    );
  }

  if (kind === 'video') {
    return (
      <div className="grid gap-3">
        <MediaField
          label={tr('Video')}
          kind="video"
          value={c.url}
          onChange={(url) => set({ url })}
          placeholder={tr('YouTube/Vimeo-lenke, eller velg fra bibliotek')}
        />
        <Field label={tr('Tilpasning')}>
          <Select value={c.fit || 'contain'} onChange={(e) => set({ fit: e.target.value })}>
            <option value="contain">{tr('Vis hele')}</option>
            <option value="cover">{tr('Fyll flaten')}</option>
          </Select>
        </Field>
        <Check label={tr('Løkke')} checked={!!c.loop} onChange={(v) => set({ loop: v })} />
        <Check label={tr('Uten lyd')} checked={c.mute !== false} onChange={(v) => set({ mute: v })} />
      </div>
    );
  }

  if (kind === 'carousel') return <CarouselFields c={c} set={set} />;
  if (kind === 'app') return <AppFields c={c} set={set} />;

  if (kind === 'weather') {
    return (
      <div className="grid gap-3">
        <Field label={tr('Sted')} hint={tr('Værdata fra MET Norway (yr.no).')}>
          <PlaceSearch value={c.place} onPick={(h) => set({ place: h.name, lat: h.lat, lon: h.lon })} />
        </Field>
        <Field label={tr('Visning')}>
          <Select value={c.layout || 'now'} onChange={(e) => set({ layout: e.target.value })}>
            <option value="now">{tr('Været nå')}</option>
            <option value="hours">{tr('Neste timer')}</option>
            <option value="days">{tr('Neste dager')}</option>
          </Select>
        </Field>
        <Field label={tr('Tekstfarge')}>
          <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
        </Field>
        <Check label={tr('Vis ramme')} checked={c.frame === true} onChange={(v) => set({ frame: v })} />
      </div>
    );
  }

  if (kind === 'rss') {
    const preset = RSS_PRESETS.find((p) => p.url === c.url);
    return (
      <div className="grid gap-3">
        <Field label={tr('Kilde')}>
          <Select value={preset ? c.url : '__custom'} onChange={(e) => e.target.value !== '__custom' && set({ url: e.target.value })}>
            {RSS_PRESETS.map((p) => (
              <option key={p.url} value={p.url}>
                {p.label}
              </option>
            ))}
            <option value="__custom">{tr('Egen RSS-adresse …')}</option>
          </Select>
        </Field>
        {!preset && (
          <Field label={tr('RSS-adresse')}>
            <Input value={c.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://…/rss" />
          </Field>
        )}
        <Field label={tr('Visning')}>
          <Select value={c.mode || 'ticker'} onChange={(e) => set({ mode: e.target.value })}>
            <option value="ticker">{tr('Rullende linje')}</option>
            <option value="single">{tr('Én sak av gangen')}</option>
            <option value="list">{tr('Liste med overskrifter')}</option>
          </Select>
        </Field>
        {(c.mode || 'ticker') === 'ticker' && (
          <Field label={tr('Fart')}>
            <Select value={c.speed || 60} onChange={(e) => set({ speed: Number(e.target.value) })}>
              <option value={35}>{tr('Rolig')}</option>
              <option value={60}>{tr('Normal')}</option>
              <option value={100}>{tr('Rask')}</option>
            </Select>
          </Field>
        )}
        <Field label={tr('Antall saker')}>
          <Input type="number" min={1} max={30} value={c.max ?? 10} onChange={(e) => set({ max: Number(e.target.value) || 10 })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr('Tekst')}>
            <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
          </Field>
          <Field label={tr('Bakgrunn')}>
            <ColorInput
              value={/^#/.test(c.background || '') ? c.background : '#000000'}
              onChange={(e) => set({ background: e.target.value })}
            />
          </Field>
        </div>
        <Check label={tr('Vis kildenavn')} checked={c.showSource !== false} onChange={(v) => set({ showSource: v })} />
      </div>
    );
  }

  if (kind === 'calendar') {
    return (
      <div className="grid gap-3">
        <Field
          label={tr('Kalenderadresse (.ics)')}
          hint={tr('Google: Innstillinger → kalenderen → «Hemmelig adresse i iCal-format». Outlook: Kalender → Del → Publiser → ICS-lenke.')}
        >
          <Input value={c.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://calendar.google.com/…/basic.ics" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr('Antall hendelser')}>
            <Input type="number" min={1} max={20} value={c.max ?? 6} onChange={(e) => set({ max: Number(e.target.value) || 6 })} />
          </Field>
          <Field label={tr('Dager fram')}>
            <Input type="number" min={1} max={90} value={c.days ?? 14} onChange={(e) => set({ days: Number(e.target.value) || 14 })} />
          </Field>
        </div>
        <Field label={tr('Tekstfarge')}>
          <ColorInput value={c.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
        </Field>
        <Check label={tr('Vis sted')} checked={c.showLocation !== false} onChange={(v) => set({ showLocation: v })} />
        <Check label={tr('Vis ramme')} checked={c.frame === true} onChange={(v) => set({ frame: v })} />
      </div>
    );
  }

  if (kind === 'web') {
    return (
      <div className="grid gap-3">
        <Field label={tr('Nettside-URL')} hint={tr('Noen sider blokkerer innramming.')}>
          <Input value={c.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" />
        </Field>
        <Field label={tr('Oppdater hvert (min, 0 = aldri)')}>
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
    return <p className="text-sm text-muted">{tr('Viser alle sponsorer, én om gangen i sin egen varighet.')}</p>;
  }

  return null;
}
