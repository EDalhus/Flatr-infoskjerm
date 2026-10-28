// Merkevare: logo, farger og skrifter for kontoen. Editoren bruker dem som
// snarveier og standardvalg, og Claude AI følger dem. Se src/lib/brand.js.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { BRAND_COLORS, cleanBrand } from '../../lib/brand.js';
import { FONTS } from '../../lib/deck.js';
import { setBrand } from '../brandStore.js';
import { MediaField } from './MediaPicker.jsx';
import { Icon, Field, Input, Select, Textarea, Button, IconButton } from './ui.jsx';
import { Section, SaveBar } from './apps/parts.jsx';

const EMPTY = cleanBrand({});

function ColorField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-paper p-1" />
        <Input value={value || ''} onChange={(e) => onChange(e.target.value.trim() || null)} placeholder="#rrggbb" className="font-mono" />
        {value && <IconButton name="x" label={`Fjern ${label}`} onClick={() => onChange(null)} />}
      </div>
    </Field>
  );
}

/** Forhåndsvisning: et lysbilde med merkevaren. */
function Preview({ b }) {
  const bg = b.colors.background || '#0f2733';
  const text = b.colors.text || '#ffffff';
  const accent = b.colors.accent || b.colors.primary || '#f2a900';
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl shadow-card" style={{ background: bg, color: text, containerType: 'size' }}>
      {b.colors.primary && <div className="absolute -right-[12%] -top-[30%] aspect-square w-[55%] rounded-full opacity-25" style={{ background: b.colors.primary }} />}
      {b.logo && <img src={b.logo} alt="" className="absolute right-[5%] top-[7%] h-[12%] max-w-[25%] object-contain" />}
      <div className="absolute left-[6%] top-[22%] w-[70%]">
        <div style={{ fontFamily: b.fonts.body || undefined, color: accent, fontSize: '3.2cqw', fontWeight: 700, letterSpacing: '0.3cqw' }}>{(b.name || 'Merkevaren').toUpperCase()}</div>
        <div style={{ fontFamily: b.fonts.heading || undefined, fontSize: '9cqw', fontWeight: 800, lineHeight: 1.05, marginTop: '1.5cqw' }}>Velkommen inn</div>
        <div style={{ fontFamily: b.fonts.body || undefined, fontSize: '3.4cqw', opacity: 0.85, marginTop: '2.5cqw' }}>Slik ser lysbildene ut med merkevaren deres.</div>
      </div>
      <div className="absolute bottom-[8%] left-[6%] h-[1.2cqw] w-[12%] rounded-full" style={{ background: accent }} />
    </div>
  );
}

export default function BrandManager() {
  const [saved, setSaved] = useState(null);
  const [b, setB] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.settings
      .get()
      .then((s) => {
        const brand = s.brand || EMPTY;
        setSaved(brand);
        setB(brand);
      })
      .catch((e) => setError(e.message));
  }, []);

  const dirty = saved && JSON.stringify(cleanBrand(b)) !== JSON.stringify(cleanBrand(saved));
  const set = (patch) => setB((x) => ({ ...x, ...patch }));
  const setColor = (key, v) => setB((x) => ({ ...x, colors: { ...x.colors, [key]: v } }));
  const setFont = (key, v) => setB((x) => ({ ...x, fonts: { ...x.fonts, [key]: v || null } }));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const s = await api.settings.update({ brand: b });
      setSaved(s.brand);
      setB(s.brand);
      setBrand(s.brand);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!saved) return <p className="p-8 text-sm text-muted">{error || 'Laster …'}</p>;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <h1 className="m-0 text-2xl font-bold text-ink">Merkevare</h1>
      <p className="m-0 mt-1 max-w-2xl text-sm text-muted">
        Logo, farger og skrifter for kontoen. Fargene blir snarveier i alle fargevelgere, nye tekster får merkevareskriften, nye lysbilder får bakgrunnsfargen – og Claude AI følger alt dette når den lager presentasjoner.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-5">
          <Section icon="image" title="Navn og logo">
            <div className="grid gap-4">
              <Field label="Navn på bedriften eller merkevaren">
                <Input value={b.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="F.eks. GC Rieber Minerals" />
              </Field>
              <MediaField label="Logo (helst PNG eller SVG med gjennomsiktig bakgrunn)" value={b.logo || ''} onChange={(logo) => set({ logo: logo || null })} />
            </div>
          </Section>

          <Section icon="tag" title="Farger">
            <div className="grid gap-4 sm:grid-cols-2">
              {BRAND_COLORS.map(({ key, label }) => (
                <ColorField key={key} label={label} value={b.colors[key]} onChange={(v) => setColor(key, v)} />
              ))}
            </div>
            <div className="mt-5">
              <div className="mb-2 text-xs font-semibold text-muted">Flere farger</div>
              <div className="grid gap-2">
                {b.extra.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={c.hex || '#000000'}
                      onChange={(e) => set({ extra: b.extra.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)) })}
                      className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-line bg-paper p-1"
                    />
                    <Input value={c.name} onChange={(e) => set({ extra: b.extra.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Navn, f.eks. Sjøgrønn" />
                    <span className="w-20 shrink-0 font-mono text-xs text-muted">{c.hex}</span>
                    <IconButton name="x" label="Fjern fargen" tone="danger" onClick={() => set({ extra: b.extra.filter((_, j) => j !== i) })} />
                  </div>
                ))}
                {b.extra.length < 8 && (
                  <button type="button" onClick={() => set({ extra: [...b.extra, { name: '', hex: '#888888' }] })} className="justify-self-start text-sm font-semibold text-brand hover:underline">
                    + Legg til farge
                  </button>
                )}
              </div>
            </div>
          </Section>

          <Section icon="text" title="Skrifter">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['heading', 'Overskrifter'],
                ['body', 'Brødtekst']
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <Select value={b.fonts[key] || ''} onChange={(e) => setFont(key, e.target.value)} style={{ fontFamily: b.fonts[key] || undefined }}>
                    {FONTS.map((f) => (
                      <option key={f.value} value={f.value} style={{ fontFamily: f.value || undefined }}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <p className="m-0 mt-3 text-xs text-muted">Skriftene finnes både i nettleseren og i Apple TV-appen (fra versjon 1.2).</p>
          </Section>

          <Section icon="edit" title="Andre regler (valgfritt)" hint="Kort om tone, logobruk eller ting som alltid/aldri skal gjøres. Claude AI følger dette. Lange retningslinjer kan du legge som PDF under Claude AI → Fast kontekst.">
            <Textarea rows={4} value={b.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="F.eks. «Logoen skal alltid stå oppe til høyre. Vi skriver på nynorsk. Aldri rødt.»" />
          </Section>
        </div>

        <div className="min-w-0">
          <div className="sticky top-4 space-y-2">
            <div className="text-xs font-semibold text-muted">Forhåndsvisning</div>
            <Preview b={b} />
            <p className="m-0 text-xs text-muted">
              <Icon name="sparkle" className="mr-1 inline h-3.5 w-3.5 text-brand" />
              Claude AI bruker merkevaren automatisk.
            </p>
          </div>
        </div>
      </div>

      <SaveBar dirty={dirty} busy={busy} error={error} onSave={save} onDiscard={() => setB(saved)} />
    </div>
  );
}
