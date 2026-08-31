import {
  BACKGROUND_PRESETS,
  DYNAMIC_PRESETS,
  TRANSITIONS,
  ELEMENT_LABEL,
  backgroundStyle,
  defaultDynamic
} from '../../../lib/deck.js';
import { Icon, Field, Input, Select, Button, ButtonGroup, ColorInput, Segmented } from '../ui.jsx';
import { MediaField } from '../MediaPicker.jsx';
import DaypartFields from '../DaypartFields.jsx';
import ElementConfigFields from './ElementConfigFields.jsx';
import DynamicBackground from '../../../viewer/DynamicBackground.jsx';

const numRow = (el, set) => (
  <div className="grid grid-cols-4 gap-2">
    {['x', 'y', 'w', 'h'].map((k) => (
      <label key={k} className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {k} %
        <Input
          type="number"
          className="mt-1"
          value={Math.round((el[k] ?? 0) * 10) / 10}
          onChange={(e) => set({ [k]: Number(e.target.value) })}
        />
      </label>
    ))}
  </div>
);

function ElementInspector({ element, categories, onChange, onDelete, onZ }) {
  const set = (patch) => onChange(element.id, patch, true);
  const setCfg = (patch) => onChange(element.id, { config: { ...element.config, ...patch } }, true);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-[0.1em] text-ink">
          {ELEMENT_LABEL[element.kind] || element.kind}
        </span>
        <button
          onClick={() => onDelete(element.id)}
          className="text-xs font-semibold text-danger hover:underline"
        >
          Slett
        </button>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Plassering</div>
        {numRow(element, set)}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Rotasjon °
            <Input
              type="number"
              className="mt-1"
              value={element.rotation || 0}
              onChange={(e) => set({ rotation: Number(e.target.value) || 0 })}
            />
          </label>
          <div className="flex flex-col justify-end">
            <ButtonGroup
              items={[
                { key: 'front', label: 'Forrest', onClick: () => onZ(element.id, 1) },
                { key: 'back', label: 'Bakerst', onClick: () => onZ(element.id, -1) }
              ]}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-hair pt-3">
        <ElementConfigFields
          kind={element.kind}
          cfg={element.config}
          set={setCfg}
          categories={categories}
        />
      </div>
    </div>
  );
}

function SlideInspector({ slide, onChange, onDuplicate, onDelete, onSaveTemplate }) {
  const set = (patch) => onChange(slide.id, patch, true);
  const bg = slide.background || { type: 'color', color: '#0f2733' };
  const setBg = (patch) => set({ background: { ...bg, ...patch } });

  return (
    <div className="space-y-4">
      <span className="text-sm font-bold uppercase tracking-[0.1em] text-ink">Lysbilde</span>

      <Field label="Navn (valgfritt)">
        <Input value={slide.name || ''} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Varighet (sek)">
          <Input
            type="number"
            min={2}
            value={slide.duration_seconds}
            onChange={(e) => set({ duration_seconds: Number(e.target.value) || 15 })}
          />
        </Field>
        <Field label="Overgang">
          <Select value={slide.transition} onChange={(e) => set({ transition: e.target.value })}>
            {TRANSITIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        {slide.transition !== 'none' && (
          <Field label="Overgang (ms)">
            <Input
              type="number"
              min={0}
              step={100}
              value={slide.transition_ms}
              onChange={(e) => set({ transition_ms: Number(e.target.value) || 0 })}
            />
          </Field>
        )}
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Bakgrunn</div>
        <div className="mb-2 grid grid-cols-6 gap-1.5">
          {BACKGROUND_PRESETS.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => set({ background: p })}
              className="relative h-8 w-full overflow-hidden rounded-lg border border-line"
              style={p.type === 'dynamic' ? { background: p.base || '#0a1a2f' } : backgroundStyle(p)}
            >
              {p.type === 'dynamic' && <DynamicBackground bg={p} />}
            </button>
          ))}
        </div>
        <Select
          value={bg.type}
          onChange={(e) =>
            e.target.value === 'dynamic'
              ? set({ background: defaultDynamic() })
              : setBg({ type: e.target.value })
          }
        >
          <option value="color">Ensfarget</option>
          <option value="gradient">Gradient</option>
          <option value="image">Bilde</option>
          <option value="dynamic">Dynamisk</option>
        </Select>

        {bg.type === 'color' && (
          <ColorInput
            className="mt-2"
            value={bg.color || '#0f2733'}
            onChange={(e) => setBg({ color: e.target.value })}
          />
        )}
        {bg.type === 'gradient' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ColorInput value={bg.from || '#1f5566'} onChange={(e) => setBg({ from: e.target.value })} />
            <ColorInput value={bg.to || '#0f2733'} onChange={(e) => setBg({ to: e.target.value })} />
            <label className="col-span-2 flex items-center gap-2 text-xs text-muted">
              Vinkel °
              <Input
                type="number"
                className="flex-1"
                value={bg.angle ?? 135}
                onChange={(e) => setBg({ angle: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
        )}
        {bg.type === 'dynamic' && (
          <div className="mt-2 space-y-2">
            <div className="relative h-24 overflow-hidden rounded-lg border border-line">
              <DynamicBackground bg={bg} />
            </div>
            <Segmented
              value={bg.preset || 'aurora'}
              onChange={(v) => setBg({ preset: v })}
              options={DYNAMIC_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
            />
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((idx) => (
                <ColorInput
                  key={idx}
                  value={(bg.colors && bg.colors[idx]) || '#34d399'}
                  onChange={(e) => {
                    const colors = [...(bg.colors || ['#34d399', '#22d3ee', '#3b82f6'])];
                    colors[idx] = e.target.value;
                    setBg({ colors });
                  }}
                />
              ))}
            </div>
            {bg.preset !== 'gradient' && (
              <label className="flex items-center gap-2 text-xs text-muted">
                Basefarge
                <ColorInput
                  className="flex-1"
                  value={bg.base || '#0a1a2f'}
                  onChange={(e) => setBg({ base: e.target.value })}
                />
              </label>
            )}
            <label className="flex items-center gap-2 text-xs text-muted">
              Fart
              <input
                type="range"
                min="0.3"
                max="2.5"
                step="0.1"
                value={bg.speed ?? 1}
                onChange={(e) => setBg({ speed: Number(e.target.value) })}
                className="flex-1 accent-brand"
              />
              <span className="w-8 text-right tabular-nums">{(bg.speed ?? 1).toFixed(1)}×</span>
            </label>
          </div>
        )}
        {bg.type === 'image' && (
          <div className="mt-2">
            <MediaField value={bg.url} onChange={(url) => setBg({ url })} />
            <Select
              className="mt-2"
              value={bg.fit || 'cover'}
              onChange={(e) => setBg({ fit: e.target.value })}
            >
              <option value="cover">Fyll flaten</option>
              <option value="contain">Vis hele</option>
            </Select>
          </div>
        )}
      </div>

      <div className="border-t border-hair pt-3">
        <DaypartFields
          value={{
            active_from: slide.active_from,
            active_to: slide.active_to,
            active_days: slide.active_days,
            active_from_date: slide.active_from_date,
            active_to_date: slide.active_to_date
          }}
          onChange={(dp) => set(dp)}
        />
      </div>

      <div className="space-y-2 border-t border-hair pt-3">
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={() => onDuplicate(slide.id)}>
            <Icon name="copy" className="h-3.5 w-3.5" />
            Dupliser
          </Button>
          <Button size="sm" variant="outline" onClick={() => onSaveTemplate(slide)}>
            Lagre som mal
          </Button>
        </div>
        <Button size="sm" variant="danger" className="w-full" onClick={() => onDelete(slide.id)}>
          Slett lysbilde
        </Button>
      </div>
    </div>
  );
}

export default function Inspector(props) {
  const { slide, element } = props;
  return (
    <div className="h-full w-80 shrink-0 overflow-y-auto border-l border-line bg-paper p-4">
      {element ? (
        <ElementInspector
          element={element}
          categories={props.categories}
          onChange={props.onElementChange}
          onDelete={props.onDeleteElement}
          onZ={props.onElementZ}
        />
      ) : slide ? (
        <SlideInspector
          slide={slide}
          onChange={props.onSlideChange}
          onDuplicate={props.onDuplicateSlide}
          onDelete={props.onDeleteSlide}
          onSaveTemplate={props.onSaveTemplate}
        />
      ) : (
        <p className="text-sm text-muted">Velg et lysbilde eller et element.</p>
      )}
    </div>
  );
}
