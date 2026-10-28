// Høyre panel i editoren: «Design» (det som er valgt – eller lysbildet) og
// «Lag» (alle elementer på lysbildet, øverst = fremst).

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import { BASE_SIZE, ELEMENT_LABEL, ELEMENT_ICON } from '../../../lib/deck.js';
import { Icon, Button } from '../ui.jsx';
import ElementConfigFields from '../deck/ElementConfigFields.jsx';
import AiPanel from './AiPanel.jsx';
import CommentsPanel from './CommentsPanel.jsx';
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

      <Section title="Animasjon">
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
          <select
            value={el.config?.anim || 'none'}
            onChange={(e) => onConfig({ anim: e.target.value })}
            className="h-8 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
            aria-label="Animasjon inn"
          >
            {ANIMS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={String(el.config?.animDelay ?? 0)}
            onChange={(e) => onConfig({ animDelay: Number(e.target.value) })}
            disabled={!el.config?.anim || el.config.anim === 'none'}
            className="h-8 rounded-lg border border-line bg-paper px-2 text-sm text-ink disabled:opacity-50"
            aria-label="Forsinkelse"
            title="Forsinkelse"
          >
            {[0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3].map((d) => (
              <option key={d} value={String(d)}>
                {d === 0 ? 'Straks' : `+${String(d).replace('.', ',')} s`}
              </option>
            ))}
          </select>
        </div>
        <p className="m-0 mt-1.5 text-[11px] text-muted">Spilles når lysbildet vises på skjermen. Gi elementene litt ulik forsinkelse for en fin rekkefølge.</p>
      </Section>

      <section className="px-4 py-4">
        <ElementConfigFields kind={el.kind} cfg={el.config} set={onConfig} categories={categories} />
      </section>
    </>
  );
}

const APP_VIEW = { map: ['Kart', 'pin'], cards: ['Båtkort', 'square'], arrivals: ['Ankomsttavle', 'clock'] };

/** Navn og undertekst i laglisten: hva slags widget, og fra hvilken app. */
function describe(el, apps) {
  const c = el.config || {};
  if (el.kind === 'text') return { title: (c.text || 'Tekst').split('\n')[0].slice(0, 40) || 'Tekst', sub: 'Tekst', icon: 'text' };
  if (el.kind === 'app') {
    const app = apps?.find((a) => a.id === c.appId);
    const from = app ? `fra ${app.name}` : c.appId ? 'App som ikke er aktivert' : 'Ingen app valgt';
    if (app?.kind === 'birthdays') return { title: c.effect === 'rain' ? 'Kakeregn' : 'Bursdager', sub: from, icon: c.effect === 'rain' ? 'sparkle' : 'calendar' };
    if (app?.kind === 'custom') return { title: 'Egen visning', sub: from, icon: 'sparkle' };
    const [title, icon] = APP_VIEW[c.view || 'map'] || ['Widget', 'sparkle'];
    return { title: app ? title : 'Flatr App', sub: from, icon: app ? icon : 'sparkle' };
  }
  return { title: ELEMENT_LABEL[el.kind] || el.kind, sub: null, icon: ELEMENT_ICON[el.kind] || 'square' };
}

function EyeBtn({ hidden, onClick, label }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-zone hover:text-ink ${hidden ? 'text-muted' : 'text-muted opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
      aria-label={hidden ? `Vis ${label}` : `Skjul ${label}`}
      title={hidden ? 'Vis' : 'Skjul'}
    >
      {hidden ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
      ) : (
        <Icon name="eye" className="h-4 w-4" />
      )}
    </button>
  );
}

function LayerRow({ el, apps, selection, locks, onSelect, onHide, indent }) {
  const lock = locks.get(el.id);
  const d = describe(el, apps);
  const hidden = el.config?.hidden === true;
  const active = selection.includes(el.id);
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => onSelect(e.shiftKey || e.metaKey ? [...new Set([...selection, el.id])] : [el.id])}
        onKeyDown={(e) => e.key === 'Enter' && onSelect([el.id])}
        className={`group flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-1 text-left text-sm ${indent ? 'pl-7' : 'pl-2'} ${
          active ? 'bg-brand-tint text-brand-dark' : 'text-ink hover:bg-zone'
        }`}
      >
        <Icon name={d.icon} className={`h-4 w-4 shrink-0 ${active ? '' : 'text-muted'}`} />
        <span className={`min-w-0 flex-1 ${hidden ? 'opacity-50' : ''}`}>
          <span className="block truncate">{d.title}</span>
          {d.sub && <span className={`block truncate text-[11px] ${active ? 'opacity-80' : 'text-muted'}`}>{d.sub}</span>}
        </span>
        {lock && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: lock.color }} title={`${lock.name} jobber her`} />}
        <EyeBtn hidden={hidden} label={d.title} onClick={() => onHide([el], !hidden)} />
      </div>
    </li>
  );
}

function GroupRow({ group, members, apps, selection, locks, onSelect, onHide, onRename, onUngroup }) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const ids = members.map((m) => m.id);
  const allHidden = members.every((m) => m.config?.hidden === true);
  const active = ids.every((id) => selection.includes(id));
  const name = members[0].config?.groupName || 'Gruppe';
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(ids)}
        onDoubleClick={() => setEditing(true)}
        className={`group flex w-full cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pl-1 pr-1 text-sm ${
          active ? 'bg-brand-tint text-brand-dark' : 'text-ink hover:bg-zone'
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted hover:text-ink"
          aria-label={open ? 'Lukk gruppen' : 'Åpne gruppen'}
          aria-expanded={open}
        >
          <Icon name="chevron" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        <Icon name="layers" className={`h-4 w-4 shrink-0 ${active ? '' : 'text-muted'}`} />
        {editing ? (
          <input
            autoFocus
            defaultValue={name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              setEditing(false);
              const v = e.target.value.trim();
              if (v && v !== name) onRename(group, v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="h-7 min-w-0 flex-1 rounded-md border border-focus bg-paper px-1.5 text-sm text-ink outline-none"
            aria-label="Navn på gruppen"
          />
        ) : (
          <span className={`min-w-0 flex-1 truncate font-semibold ${allHidden ? 'opacity-50' : ''}`} title="Dobbeltklikk for å gi nytt navn">
            {name} <span className="font-normal text-muted">({members.length})</span>
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUngroup(group);
          }}
          className="h-7 shrink-0 rounded-md px-1.5 text-[11px] font-semibold text-muted opacity-0 hover:bg-zone hover:text-ink focus:opacity-100 group-hover:opacity-100"
          title="Løs opp gruppen"
        >
          Løs opp
        </button>
        <EyeBtn hidden={allHidden} label={name} onClick={() => onHide(members, !allHidden)} />
      </div>
      {open && (
        <ul className="m-0 list-none p-0">
          {members.map((el) => (
            <LayerRow key={el.id} el={el} apps={apps} selection={selection} locks={locks} onSelect={onSelect} onHide={onHide} indent />
          ))}
        </ul>
      )}
    </li>
  );
}

const ANIMS = [
  ['none', 'Ingen'],
  ['fade', 'Ton inn'],
  ['up', 'Glid opp'],
  ['left', 'Glid inn fra venstre'],
  ['zoom', 'Zoom inn']
];

function LayerList({ elements, selection, locks, onSelect, onPatch, onGroup }) {
  const [apps, setApps] = useState(null);
  useEffect(() => {
    if (!elements.some((e) => e.kind === 'app')) return;
    api.apps.list().then(setApps).catch(() => setApps([]));
  }, [elements.some((e) => e.kind === 'app')]);

  const list = [...elements].sort((a, b) => b.z - a.z || b.id - a.id);
  if (!list.length) return <p className="m-0 p-4 text-sm text-muted">Lysbildet er tomt. Sett inn noe fra verktøylinjen.</p>;

  const onHide = (els, hidden) => onPatch(els.map((el) => ({ id: el.id, patch: { config: { ...el.config, hidden } } })));
  const membersOf = (g) => list.filter((e) => e.config?.group === g);
  const onRename = (g, groupName) => onPatch(membersOf(g).map((el) => ({ id: el.id, patch: { config: { ...el.config, groupName } } })));
  const onUngroup = (g) =>
    onPatch(
      membersOf(g).map((el) => {
        const { group, groupName, ...config } = el.config || {};
        return { id: el.id, patch: { config } };
      })
    );

  // Grupper vises der det fremste medlemmet ligger.
  const seen = new Set();
  const rows = [];
  for (const el of list) {
    const g = el.config?.group;
    if (!g) rows.push({ el });
    else if (!seen.has(g)) {
      seen.add(g);
      rows.push({ group: g, members: membersOf(g) });
    }
  }
  const canGroup = selection.length > 1;

  return (
    <div className="p-2">
      <ul className="m-0 list-none p-0">
        {rows.map((r) =>
          r.group ? (
            <GroupRow
              key={`g-${r.group}`}
              group={r.group}
              members={r.members}
              apps={apps}
              selection={selection}
              locks={locks}
              onSelect={onSelect}
              onHide={onHide}
              onRename={onRename}
              onUngroup={onUngroup}
            />
          ) : (
            <LayerRow key={r.el.id} el={r.el} apps={apps} selection={selection} locks={locks} onSelect={onSelect} onHide={onHide} />
          )
        )}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line px-2 pt-3 text-[11px] text-muted">
        <span>{canGroup ? `${selection.length} valgt` : 'Shift-klikk for å velge flere'}</span>
        <button
          type="button"
          disabled={!canGroup}
          onClick={onGroup}
          className="rounded-md px-2 py-1 font-semibold text-brand hover:bg-zone disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent"
          title={`Grupper (${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl+'}G)`}
        >
          Grupper
        </button>
      </div>
    </div>
  );
}

export default function Panel(props) {
  const { slide, selected, orientation, categories, locks, selection } = props;
  // Fanen styres av editoren (⌘K åpner AI-fanen), ellers av panelet selv.
  const [ownTab, setOwnTab] = useState('design');
  const tab = props.tab ?? ownTab;
  const setTab = props.onTab ?? setOwnTab;

  return (
    <aside className={`flex h-full shrink-0 flex-col border-l border-line bg-card ${tab === 'ai' ? 'w-[400px]' : 'w-80'}`}>
      <div className="flex gap-1 border-b border-line p-2" role="tablist">
        {[
          ['design', 'Design'],
          ['layers', `Lag${slide ? ` (${slide.elements.length})` : ''}`],
          ['comments', `💬${props.openComments ? ` ${props.openComments}` : ''}`],
          ...(props.aiEnabled ? [['ai', '✦ AI']] : [])
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

      {/* AI-fanen holdes montert, så samtalen fortsetter når du bytter fane. */}
      <div className={`min-h-0 flex-1 ${tab === 'comments' ? '' : 'hidden'}`}>
        <CommentsPanel
          playlistId={props.playlistId}
          slide={slide}
          slides={props.slides || []}
          selected={selected}
          onSelectElement={(id) => props.onSelect([id])}
          onSelectSlide={props.onSelectSlide}
          onCount={props.onCommentCount}
        />
      </div>

      {props.aiEnabled && (
        <div className={`min-h-0 flex-1 ${tab === 'ai' ? '' : 'hidden'}`}>
          <AiPanel playlistId={props.playlistId} onChanged={props.onAiChanged} pending={props.aiPending} onPendingUsed={props.onAiPendingUsed} />
        </div>
      )}

      <div className={`min-h-0 flex-1 overflow-y-auto ${tab === 'ai' || tab === 'comments' ? 'hidden' : ''}`}>
        {tab === 'layers' && slide ? (
          <LayerList elements={slide.elements} selection={selection} locks={locks} onSelect={props.onSelect} onPatch={props.onPatch} onGroup={props.onGroup} />
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
