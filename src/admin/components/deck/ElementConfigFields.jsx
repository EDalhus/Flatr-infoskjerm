import { PROGRAM_MODES, MESSAGE_EMPHASIS } from '../../../lib/slides.js';
import { FONTS, FONT_WEIGHTS } from '../../../lib/deck.js';
import { isoToLocalInput, localInputToIso } from '../../../lib/time.js';
import { Field, Input, Select, Textarea, Segmented, ToggleButton } from '../ui.jsx';
import { MediaField } from '../MediaPicker.jsx';

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

        <div className="flex items-center gap-1.5">
          <ToggleButton
            active={(c.weight ?? 700) >= 700}
            onClick={() => set({ weight: (c.weight ?? 700) >= 700 ? 400 : 700 })}
          >
            B
          </ToggleButton>
          <ToggleButton active={!!c.italic} onClick={() => set({ italic: !c.italic })}>
            <span className="italic">I</span>
          </ToggleButton>
          <ToggleButton active={!!c.underline} onClick={() => set({ underline: !c.underline })}>
            <span className="underline">U</span>
          </ToggleButton>
          <ToggleButton active={!!c.strike} onClick={() => set({ strike: !c.strike })}>
            <span className="line-through">S</span>
          </ToggleButton>
          <ToggleButton active={!!c.shadow} onClick={() => set({ shadow: !c.shadow })} className="ml-auto">
            <span className="text-[10px]">skygge</span>
          </ToggleButton>
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Fyll</div>
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
              <input
                type="color"
                value={fill.from}
                onChange={(e) => set({ fill: { ...fill, from: e.target.value } })}
                className="h-9 w-full cursor-pointer rounded-lg border border-line bg-white"
              />
              <input
                type="color"
                value={fill.to}
                onChange={(e) => set({ fill: { ...fill, to: e.target.value } })}
                className="h-9 w-full cursor-pointer rounded-lg border border-line bg-white"
              />
              <label className="col-span-2 text-xs text-muted">
                Vinkel °
                <Input
                  type="number"
                  value={fill.angle ?? 294}
                  onChange={(e) => set({ fill: { ...fill, angle: Number(e.target.value) || 0 } })}
                />
              </label>
            </div>
          ) : (
            <input
              type="color"
              value={c.color || '#ffffff'}
              onChange={(e) => set({ color: e.target.value })}
              className="mt-2 h-9 w-full cursor-pointer rounded-lg border border-line bg-white"
            />
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Justering
          </div>
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
        </div>

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
          <input
            type="color"
            value={c.fill || '#1f5566'}
            onChange={(e) => set({ fill: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-line bg-white"
          />
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
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
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
        <Field label="Video-URL" hint="MP4/WebM eller YouTube/Vimeo.">
          <Input value={c.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" />
        </Field>
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
