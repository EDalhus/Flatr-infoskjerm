// Høyre panel i editoren: «Design» (det som er valgt – eller lysbildet) og
// «Lag» (alle elementer på lysbildet, øverst = fremst).

import { useState } from 'react';
import { BASE_SIZE, ELEMENT_LABEL, ELEMENT_ICON } from '../../../lib/deck.js';
import { Icon, Button } from '../ui.jsx';
import ElementConfigFields from '../deck/ElementConfigFields.jsx';
import { SlideInspector } from '../deck/Inspector.jsx';

function Section({ title, children, action }) {
  return (
    <section className="border-b border-line px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="m-0 text-xs font-semibold text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function NumField({ label, value, onChange, suffix }) {
  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-line bg-paper px-2 focus-within:border-focus">
      <span className="w-3 text-[11px] font-semibold text-muted">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-full min-w-0 bg-transparent text-sm tabular-nums text-ink outline-none"
      />
      {suffix && <span className="text-[11px] text-muted">{suffix}</span>}
    </label>
  );
}

function IconBtn({ icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid h-8 flex-1 place-items-center rounded-lg border border-line bg-paper text-ink hover:bg-hair disabled:opacity-40"
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

// Enkle justeringsikoner (strek + boks).
const ALIGN = [
  { id: 'left', label: 'Venstrejuster', d: 'M4 3v18M8 7h10v4H8zM8 13h6v4H8z' },
  { id: 'hcenter', label: 'Midtstill vannrett', d: 'M12 3v18M6 7h12v4H6zM8 13h8v4H8z' },
  { id: 'right', label: 'Høyrejuster', d: 'M20 3v18M6 7h10v4H6zM10 13h6v4h-6z' },
  { id: 'top', label: 'Juster til topp', d: 'M3 4h18M7 8h4v10H7zM13 8h4v6h-4z' },
  { id: 'vcenter', label: 'Midtstill loddrett', d: 'M3 12h18M7 6h4v12H7zM13 8h4v8h-4z' },
  { id: 'bottom', label: 'Juster til bunn', d: 'M3 20h18M7 6h4v10H7zM13 10h4v6h-4z' }
];

function AlignRow({ onAlign, hint }) {
  return (
    <div>
      <div className="flex gap-1">
        {ALIGN.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onAlign(a.id)}
            title={a.label}
            aria-label={a.label}
            className="grid h-8 flex-1 place-items-center rounded-lg border border-line bg-paper text-ink hover:bg-hair"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d={a.d} />
            </svg>
          </button>
        ))}
      </div>
      <p className="m-0 mt-1.5 text-[11px] text-muted">{hint}</p>
    </div>
  );
}

function ElementDesign({ el, orientation, categories, onPatch, onConfig, onLayer, onAlign, onDuplicate, onDelete }) {
  const base = BASE_SIZE[orientation] || BASE_SIZE.landscape;
  const toPx = (pct, axis) => Math.round((pct / 100) * (axis === 'x' ? base.w : base.h));
  const toPct = (v, axis) => (v / (axis === 'x' ? base.w : base.h)) * 100;

  return (
    <>
      <Section
        title={ELEMENT_LABEL[el.kind] || el.kind}
        action={
          <span className="flex gap-1">
            <button type="button" onClick={onDuplicate} className="text-xs font-semibold text-brand hover:underline">
              Dupliser
            </button>
            <span className="text-muted">·</span>
            <button type="button" onClick={onDelete} className="text-xs font-semibold text-danger hover:underline">
              Slett
            </button>
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <NumField label="X" value={toPx(el.x, 'x')} onChange={(v) => onPatch({ x: toPct(v, 'x') })} />
          <NumField label="Y" value={toPx(el.y, 'y')} onChange={(v) => onPatch({ y: toPct(v, 'y') })} />
          <NumField label="B" value={toPx(el.w, 'x')} onChange={(v) => onPatch({ w: Math.max(0.5, toPct(v, 'x')) })} />
          <NumField label="H" value={toPx(el.h, 'y')} onChange={(v) => onPatch({ h: Math.max(0.5, toPct(v, 'y')) })} />
          <NumField label="↻" value={el.rotation || 0} suffix="°" onChange={(v) => onPatch({ rotation: ((v % 360) + 360) % 360 })} />
        </div>
      </Section>

      <Section title="Lag og justering">
        <div className="mb-2 flex gap-1">
          <IconBtn icon="up" label="Helt fremst" onClick={() => onLayer('front')} />
          <IconBtn icon="chevron" label="Ett lag fram" onClick={() => onLayer('forward')} />
          <IconBtn icon="back" label="Ett lag bak" onClick={() => onLayer('backward')} />
          <IconBtn icon="down" label="Helt bakerst" onClick={() => onLayer('back')} />
        </div>
        <AlignRow onAlign={onAlign} hint="Justerer mot lerretet." />
      </Section>

      <section className="px-4 py-4">
        <ElementConfigFields kind={el.kind} cfg={el.config} set={onConfig} categories={categories} />
      </section>
    </>
  );
}

function LayerList({ elements, selection, locks, onSelect }) {
  const list = [...elements].sort((a, b) => b.z - a.z || b.id - a.id);
  if (!list.length) return <p className="m-0 p-4 text-sm text-muted">Lysbildet er tomt. Sett inn noe fra verktøylinjen.</p>;
  return (
    <ul className="m-0 list-none p-2">
      {list.map((el) => {
        const lock = locks.get(el.id);
        const label = el.kind === 'text' ? (el.config?.text || 'Tekst').split('\n')[0].slice(0, 40) : ELEMENT_LABEL[el.kind];
        return (
          <li key={el.id}>
            <button
              type="button"
              onClick={(e) => onSelect(e.shiftKey ? [...new Set([...selection, el.id])] : [el.id])}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                selection.includes(el.id) ? 'bg-brand-tint text-brand-dark' : 'text-ink hover:bg-zone'
              }`}
            >
              <Icon name={ELEMENT_ICON[el.kind] || 'square'} className="h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {lock && (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: lock.color }} title={`${lock.name} jobber her`} />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function Panel(props) {
  const { slide, selected, orientation, categories, locks, selection } = props;
  const [tab, setTab] = useState('design');

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-line bg-card">
      <div className="flex gap-1 border-b border-line p-2" role="tablist">
        {[
          ['design', 'Design'],
          ['layers', `Lag${slide ? ` (${slide.elements.length})` : ''}`]
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`h-8 flex-1 rounded-lg text-sm font-semibold ${tab === id ? 'bg-zone text-ink' : 'text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'layers' && slide ? (
          <LayerList elements={slide.elements} selection={selection} locks={locks} onSelect={props.onSelect} />
        ) : selected.length === 1 ? (
          <ElementDesign
            el={selected[0]}
            orientation={orientation}
            categories={categories}
            onPatch={(patch) => props.onPatch([{ id: selected[0].id, patch }])}
            onConfig={(cfg) => props.onPatch([{ id: selected[0].id, patch: { config: { ...selected[0].config, ...cfg } } }])}
            onLayer={(dir) => props.onLayer(dir)}
            onAlign={(a) => props.onAlign(a, 'canvas')}
            onDuplicate={props.onDuplicate}
            onDelete={props.onDelete}
          />
        ) : selected.length > 1 ? (
          <>
            <Section title={`${selected.length} elementer valgt`}>
              <AlignRow onAlign={(a) => props.onAlign(a, 'selection')} hint="Justerer elementene mot hverandre." />
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={props.onDuplicate} className="flex-1">
                  Dupliser
                </Button>
                <Button variant="danger" size="sm" onClick={props.onDelete} className="flex-1">
                  Slett
                </Button>
              </div>
            </Section>
            <p className="m-0 px-4 py-3 text-xs text-muted">Shift-klikk for å legge til eller fjerne fra utvalget.</p>
          </>
        ) : slide ? (
          <div className="p-4">
            <SlideInspector
              slide={slide}
              onChange={props.onSlidePatch}
              onDuplicate={props.onDuplicateSlide}
              onDelete={props.onDeleteSlide}
              onSaveTemplate={props.onSaveTemplate}
            />
          </div>
        ) : (
          <p className="m-0 p-4 text-sm text-muted">Velg et lysbilde.</p>
        )}
      </div>
    </aside>
  );
}
