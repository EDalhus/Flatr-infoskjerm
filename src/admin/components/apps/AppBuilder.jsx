import { useMemo, useState } from 'react';
import { api } from '../../../lib/api.js';
import { CATEGORIES, APP_ICONS, TEMPLATES, extractItems, cleanManifest } from '../../../lib/appCatalog.js';
import CustomAppView from '../../../viewer/slides/CustomAppView.jsx';
import AppIcon from './AppIcon.jsx';
import { Icon, Field, Input, Textarea, Select, Button, IconButton, Card, ErrorText, ColorInput, Segmented } from '../ui.jsx';

// Appbyggeren: lag en egen Flatr App uten kode. Utvikleren oppgir et JSON-API,
// hvilke innstillinger kundene må fylle inn (f.eks. API-nøkkel), tester API-et,
// og velger felt og mal for visningen. Resultatet er et manifest (se
// cleanManifest i src/lib/appCatalog.js).

const EMPTY = {
  name: '',
  tagline: '',
  description: '',
  category: 'data',
  icon: 'sparkle',
  color: '#5b5bd6',
  settings: [],
  source: { url: '', headers: [], itemsPath: '', refreshMinutes: 5 },
  display: { template: 'list', heading: '', max: 10, fields: { title: '', subtitle: '', value: '', unit: '', image: '', lat: '', lon: '' }, columns: [] }
};

// Hvilke felt hver mal bruker.
const TEMPLATE_FIELDS = {
  value: ['value', 'title', 'subtitle', 'unit'],
  list: ['title', 'subtitle', 'value', 'unit', 'image'],
  cards: ['title', 'subtitle', 'value', 'unit', 'image'],
  table: [],
  map: ['title', 'lat', 'lon']
};
const FIELD_LABEL = { title: 'Tittel', subtitle: 'Undertekst', value: 'Verdi', unit: 'Enhet (tekst)', image: 'Bilde-URL', lat: 'Breddegrad', lon: 'Lengdegrad' };

function Section({ n, title, hint, children }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-tint text-xs font-bold text-brand">{n}</span>
          {title}
        </span>
      }
    >
      {hint && <p className="m-0 mb-4 text-sm text-muted">{hint}</p>}
      {children}
    </Card>
  );
}

function PathSelect({ value, onChange, paths, placeholder = 'Velg felt …' }) {
  const options = paths.includes(value) || !value ? paths : [value, ...paths];
  return (
    <Select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </Select>
  );
}

export default function AppBuilder({ app, onDone }) {
  const [m, setM] = useState(() => (app ? structuredClone({ ...EMPTY, ...app, display: { ...EMPTY.display, ...app.display } }) : structuredClone(EMPTY)));
  const [testValues, setTestValues] = useState({});
  const [test, setTest] = useState(null);
  const [testError, setTestError] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const set = (patch) => setM((x) => ({ ...x, ...patch }));
  const setSource = (patch) => setM((x) => ({ ...x, source: { ...x.source, ...patch } }));
  const setDisplay = (patch) => setM((x) => ({ ...x, display: { ...x.display, ...patch } }));
  const setField = (k, v) => setM((x) => ({ ...x, display: { ...x.display, fields: { ...x.display.fields, [k]: v } } }));

  const body = useMemo(() => {
    if (!test?.sample) return null;
    try {
      return JSON.parse(test.sample);
    } catch {
      return null; // for stort til å tolkes lokalt – bruk serverens utplukk
    }
  }, [test]);

  // Forhåndsvisningen regnes ut lokalt fra test-svaret, så feltvalg vises med en gang.
  let preview = test?.items || [];
  let manifestError = '';
  try {
    const clean = cleanManifest({ ...m, name: m.name || 'App', source: { ...m.source, url: m.source.url || 'https://x' } });
    if (body) preview = extractItems(body, clean);
  } catch (e) {
    manifestError = e.message;
  }

  const runTest = async () => {
    setTestError('');
    setTesting(true);
    try {
      const res = await api.appMarket.test({ ...m, name: m.name || 'Test' }, testValues);
      setTest(res);
      // Foreslå listen hvis svaret har én åpenbar liste og ingen er valgt.
      if (!m.source.itemsPath && res.list_paths?.length === 1 && res.list_paths[0]) setSource({ itemsPath: res.list_paths[0] });
    } catch (e) {
      setTest(null);
      setTestError(e.message);
    } finally {
      setTesting(false);
    }
  };

  const save = async (submit = false) => {
    setError('');
    setBusy(true);
    try {
      let saved = app?.id ? await api.appMarket.update(app.id, m) : await api.appMarket.create(m);
      if (submit) saved = await api.appMarket.submit(saved.id);
      onDone(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const fieldPaths = test?.field_paths || [];
  const used = TEMPLATE_FIELDS[m.display.template] || [];
  const placeholders = m.settings.map((s) => `{{${s.key}}}`).join(', ');

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 space-y-6">
        <Section n={1} title="Om appen" hint="Slik vises appen i markedsplassen.">
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <AppIcon icon={m.icon} color={m.color} size={64} />
              <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_120px]">
                <Field label="Navn">
                  <Input value={m.name} onChange={(e) => set({ name: e.target.value })} placeholder="F.eks. Strømpris" maxLength={60} />
                </Field>
                <Field label="Farge">
                  <ColorInput value={m.color} onChange={(e) => set({ color: e.target.value })} />
                </Field>
              </div>
            </div>
            <Field label="Ikon">
              <div className="flex flex-wrap gap-1.5">
                {APP_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => set({ icon: ic })}
                    className={`grid h-9 w-9 place-items-center rounded-lg border ${m.icon === ic ? 'border-brand bg-brand-tint text-brand' : 'border-line text-muted hover:bg-zone'}`}
                    aria-label={ic}
                  >
                    <Icon name={ic} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Kort beskrivelse">
              <Input value={m.tagline} onChange={(e) => set({ tagline: e.target.value })} maxLength={140} placeholder="Én setning om hva appen viser." />
            </Field>
            <Field label="Beskrivelse">
              <Textarea rows={3} value={m.description} onChange={(e) => set({ description: e.target.value })} placeholder="Hva appen gjør, hvor dataene kommer fra og hva kunden trenger." />
            </Field>
            <Field label="Kategori">
              <Select value={m.category} onChange={(e) => set({ category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section
          n={2}
          title="Innstillinger kunden fyller inn"
          hint="F.eks. en API-nøkkel eller et sted. Hver kunde som aktiverer appen fyller inn sine egne verdier. Hemmelige felt lagres kryptert."
        >
          <div className="grid gap-2">
            {m.settings.map((s, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                <Field label="Navn i skjemaet">
                  <Input value={s.label} onChange={(e) => set({ settings: m.settings.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="API-nøkkel" />
                </Field>
                <Field label="Nøkkel">
                  <Input
                    value={s.key}
                    onChange={(e) =>
                      set({ settings: m.settings.map((x, j) => (j === i ? { ...x, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') } : x)) })
                    }
                    placeholder="api_key"
                  />
                </Field>
                <Field label="Type">
                  <Select value={s.type} onChange={(e) => set({ settings: m.settings.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}>
                    <option value="text">Tekst</option>
                    <option value="secret">Hemmelig</option>
                    <option value="number">Tall</option>
                  </Select>
                </Field>
                <IconButton name="x" label="Fjern feltet" tone="danger" onClick={() => set({ settings: m.settings.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => set({ settings: [...m.settings, { key: m.settings.length ? `felt${m.settings.length + 1}` : 'api_key', label: m.settings.length ? '' : 'API-nøkkel', type: m.settings.length ? 'text' : 'secret', required: true }] })}
              >
                <Icon name="plus" className="h-4 w-4" />
                Legg til felt
              </Button>
            </div>
          </div>
        </Section>

        <Section n={3} title="Datakilde" hint={`Et API som svarer med JSON over https.${placeholders ? ` Bruk ${placeholders} der innstillingene skal inn.` : ''}`}>
          <div className="grid gap-4">
            <Field label="API-adresse">
              <Input value={m.source.url} onChange={(e) => setSource({ url: e.target.value })} placeholder="https://api.eksempel.no/v1/data?sted={{sted}}" />
            </Field>
            <Field label="Hoder (valgfritt)" hint="F.eks. Authorization: Bearer {{api_key}}">
              <div className="grid gap-2">
                {m.source.headers.map((h, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                    <Input value={h.name} onChange={(e) => setSource({ headers: m.source.headers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Authorization" />
                    <Input value={h.value} onChange={(e) => setSource({ headers: m.source.headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} placeholder="Bearer {{api_key}}" />
                    <IconButton name="x" label="Fjern hodet" tone="danger" onClick={() => setSource({ headers: m.source.headers.filter((_, j) => j !== i) })} />
                  </div>
                ))}
                <div>
                  <Button variant="outline" size="sm" onClick={() => setSource({ headers: [...m.source.headers, { name: '', value: '' }] })}>
                    <Icon name="plus" className="h-4 w-4" />
                    Legg til hode
                  </Button>
                </div>
              </div>
            </Field>
            <Field label="Hent nye data hvert (minutt)">
              <Input type="number" min={1} max={1440} value={m.source.refreshMinutes} onChange={(e) => setSource({ refreshMinutes: Number(e.target.value) || 5 })} />
            </Field>

            {m.settings.length > 0 && (
              <div className="rounded-xl bg-zone p-3">
                <div className="mb-2 text-xs font-semibold text-muted">Testverdier (lagres ikke)</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {m.settings.map((s) => (
                    <Input
                      key={s.key}
                      type={s.type === 'secret' ? 'password' : 'text'}
                      autoComplete="off"
                      placeholder={s.label || s.key}
                      value={testValues[s.key] || ''}
                      onChange={(e) => setTestValues({ ...testValues, [s.key]: e.target.value })}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runTest} disabled={testing || !m.source.url}>
                <Icon name="refresh" className="h-4 w-4" />
                {testing ? 'Tester …' : 'Test API-et'}
              </Button>
              {test && (
                <span className="text-sm text-muted">
                  Svar mottatt · {test.count} {test.count === 1 ? 'element' : 'elementer'} i listen
                </span>
              )}
            </div>
            <ErrorText>{testError}</ErrorText>

            {test && (
              <>
                <Field label="Hvor ligger listen i svaret?" hint="Tom = hele svaret er listen (eller ett enkelt objekt).">
                  <PathSelect value={m.source.itemsPath} onChange={(v) => setSource({ itemsPath: v })} paths={test.list_paths.filter(Boolean)} placeholder="(hele svaret)" />
                </Field>
                <button type="button" onClick={() => setShowJson(!showJson)} className="justify-self-start text-sm font-semibold text-brand hover:underline">
                  {showJson ? 'Skjul svaret' : 'Vis svaret fra API-et'}
                </button>
                {showJson && <pre className="m-0 max-h-72 overflow-auto rounded-xl bg-zone p-3 text-xs text-ink">{test.sample}</pre>}
              </>
            )}
          </div>
        </Section>

        <Section n={4} title="Visning" hint={test ? 'Velg mal og hvilke felt som skal vises.' : 'Test API-et først, så kan du velge felt fra svaret.'}>
          <div className="grid gap-4">
            <Segmented value={m.display.template} onChange={(v) => setDisplay({ template: v })} options={TEMPLATES.map((t) => ({ value: t.id, label: t.label }))} />
            <p className="m-0 text-xs text-muted">{TEMPLATES.find((t) => t.id === m.display.template)?.hint}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {m.display.template !== 'map' && (
                <Field label="Overskrift (valgfritt)">
                  <Input value={m.display.heading} onChange={(e) => setDisplay({ heading: e.target.value })} />
                </Field>
              )}
              <Field label="Maks antall elementer">
                <Input type="number" min={1} max={50} value={m.display.max} onChange={(e) => setDisplay({ max: Number(e.target.value) || 10 })} />
              </Field>
              {used.map((k) =>
                k === 'unit' ? (
                  <Field key={k} label={FIELD_LABEL[k]}>
                    <Input value={m.display.fields.unit} onChange={(e) => setField('unit', e.target.value)} placeholder="°C, kr, stk …" maxLength={12} />
                  </Field>
                ) : (
                  <Field key={k} label={FIELD_LABEL[k]}>
                    <PathSelect value={m.display.fields[k]} onChange={(v) => setField(k, v)} paths={fieldPaths} />
                  </Field>
                )
              )}
            </div>
            {m.display.template === 'table' && (
              <div className="grid gap-2">
                {m.display.columns.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <Field label={`Kolonne ${i + 1}`}>
                      <Input value={c.label} onChange={(e) => setDisplay({ columns: m.display.columns.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Overskrift" />
                    </Field>
                    <Field label="Felt">
                      <PathSelect value={c.path} onChange={(v) => setDisplay({ columns: m.display.columns.map((x, j) => (j === i ? { ...x, path: v } : x)) })} paths={fieldPaths} />
                    </Field>
                    <IconButton name="x" label="Fjern kolonnen" tone="danger" onClick={() => setDisplay({ columns: m.display.columns.filter((_, j) => j !== i) })} />
                  </div>
                ))}
                {m.display.columns.length < 6 && (
                  <div>
                    <Button variant="outline" size="sm" onClick={() => setDisplay({ columns: [...m.display.columns, { label: '', path: '' }] })}>
                      <Icon name="plus" className="h-4 w-4" />
                      Legg til kolonne
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>
      </div>

      <div className="min-w-0">
        <div className="sticky top-4 space-y-4">
          <div>
            <div className="mb-2 text-xs font-semibold text-muted">Forhåndsvisning</div>
            <div
              className="aspect-video w-full overflow-hidden rounded-2xl border border-hair p-4 text-white"
              style={{ background: 'linear-gradient(135deg, #1f5566, #0f2733)', containerType: 'size' }}
            >
              {test ? (
                <CustomAppView
                  template={m.display.template}
                  display={{ heading: m.display.heading, unit: m.display.fields.unit, columns: m.display.columns.map((c) => c.label) }}
                  items={preview}
                  color={m.color}
                />
              ) : (
                <div className="grid h-full place-items-center text-center text-sm opacity-70">Test API-et for å se en forhåndsvisning.</div>
              )}
            </div>
          </div>
          <Card title="Lagre">
            <div className="grid gap-3">
              <p className="m-0 text-sm text-muted">
                Appen er privat for kontoen din til du sender den til godkjenning. Når Flatr har godkjent den, kan andre kunder aktivere den med sine egne
                innstillinger. Endringer etter godkjenning må godkjennes på nytt.
              </p>
              {app?.review_status === 'rejected' && app.review_note && (
                <p className="m-0 rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">Avvist: {app.review_note}</p>
              )}
              <ErrorText>{error || (manifestError && m.name && m.source.url ? manifestError : '')}</ErrorText>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => save(false)} disabled={busy}>
                  <Icon name="check" className="h-4 w-4" />
                  {busy ? 'Lagrer …' : 'Lagre'}
                </Button>
                <Button variant="outline" onClick={() => save(true)} disabled={busy}>
                  <Icon name="share" className="h-4 w-4" />
                  Lagre og send til godkjenning
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
