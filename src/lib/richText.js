// Formatert tekst i tekstelementer: punktlister, nummererte lister og fet,
// kursiv, understreket eller farget skrift midt i en setning.
//
// config.rich = [{ type: 'p' | 'ul' | 'ol', runs: [{ t, b?, i?, u?, c? }] }]
// config.text = den samme teksten uten formatering, med «• » og «1. » foran
// listepunktene. Spillere uten støtte for formatering (eldre Apple TV-apper),
// søk og AI-assistenten bruker den. Endres teksten et annet sted enn i editoren
// (f.eks. av AI-en), stemmer den ikke lenger med rich, og da vises bare teksten.

const HEX = /^#[0-9a-f]{6}$/i;

/** Ren tekst for blokkene, med listemerker. */
export function richToPlain(blocks) {
  let n = 0;
  return (blocks || [])
    .map((b) => {
      n = b.type === 'ol' ? n + 1 : 0;
      const marker = b.type === 'ul' ? '• ' : b.type === 'ol' ? `${n}. ` : '';
      return marker + (b.runs || []).map((r) => r.t).join('');
    })
    .join('\n');
}

/** Formateringen som skal vises, eller null (ingen, eller utdatert fordi teksten er endret et annet sted). */
export function activeRich(c) {
  const rich = c?.rich;
  if (!Array.isArray(rich) || !rich.length) return null;
  return richToPlain(rich) === (c.text ?? '') ? rich : null;
}

/** Har blokkene noe annet enn vanlige avsnitt uten formatering? */
export const hasFormatting = (blocks) =>
  (blocks || []).some((b) => b.type !== 'p' || (b.runs || []).some((r) => r.b || r.i || r.u || r.c));

/** Vanlig tekst som blokker (én per linje). */
export const plainToRich = (text) => String(text ?? '').split('\n').map((t) => ({ type: 'p', runs: t ? [{ t }] : [] }));

/** Rydder blokker fra nettleseren/API-et: bare kjente felt og gyldige farger. */
export function cleanRich(blocks) {
  if (!Array.isArray(blocks)) return null;
  return blocks.slice(0, 200).map((b) => ({
    type: ['ul', 'ol'].includes(b?.type) ? b.type : 'p',
    runs: (Array.isArray(b?.runs) ? b.runs : [])
      .filter((r) => typeof r?.t === 'string' && r.t)
      .slice(0, 200)
      .map((r) => ({
        t: r.t.slice(0, 2000),
        ...(r.b ? { b: true } : {}),
        ...(r.i ? { i: true } : {}),
        ...(r.u ? { u: true } : {}),
        ...(HEX.test(r.c || '') ? { c: r.c.toLowerCase() } : {})
      }))
  }));
}

/* ------------------------------ editoren -------------------------------- */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runHtml(r) {
  let h = esc(r.t);
  if (r.u) h = `<u>${h}</u>`;
  if (r.i) h = `<i>${h}</i>`;
  if (r.b) h = `<b>${h}</b>`;
  if (r.c) h = `<font color="${r.c}">${h}</font>`;
  return h;
}

/** Blokkene som HTML til redigeringsfeltet (contentEditable). */
export function richToHtml(blocks) {
  let html = '';
  let list = null;
  for (const b of blocks) {
    const inner = b.runs.map(runHtml).join('') || '<br>';
    if (b.type === 'p') {
      if (list) html += `</${list}>`;
      list = null;
      html += `<div>${inner}</div>`;
    } else {
      if (list !== b.type) {
        if (list) html += `</${list}>`;
        html += `<${b.type}>`;
        list = b.type;
      }
      html += `<li>${inner}</li>`;
    }
  }
  if (list) html += `</${list}>`;
  return html;
}

const toHex = (color) => {
  if (!color) return null;
  if (HEX.test(color)) return color.toLowerCase();
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(color);
  return m ? `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}` : null;
};

/** Stilen et element i redigeringsfeltet gir teksten inni. */
function styleOf(el, st) {
  const next = { ...st };
  const tag = el.tagName;
  if (tag === 'B' || tag === 'STRONG') next.b = true;
  if (tag === 'I' || tag === 'EM') next.i = true;
  if (tag === 'U') next.u = true;
  if (tag === 'FONT' && el.getAttribute('color')) next.c = toHex(el.getAttribute('color')) || next.c;
  const s = el.style;
  if (s) {
    if (s.fontWeight && (s.fontWeight === 'bold' || Number(s.fontWeight) >= 600)) next.b = true;
    if (s.fontStyle === 'italic') next.i = true;
    if (/underline/.test(s.textDecoration || s.textDecorationLine || '')) next.u = true;
    if (s.color) next.c = toHex(s.color) || next.c;
  }
  return next;
}

const sameStyle = (a, b) => !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u && (a.c || null) === (b.c || null);

/** Leser redigeringsfeltet tilbake til blokker. */
export function domToRich(root) {
  const blocks = [];
  let cur = null;
  let pending = 'p'; // typen neste avsnitt får når det kommer tekst
  const open = (type) => {
    cur = { type, runs: [] };
    blocks.push(cur);
  };
  const text = (t, st) => {
    if (!t) return;
    if (!cur) open(pending);
    const last = cur.runs[cur.runs.length - 1];
    const run = { t, ...(st.b ? { b: true } : {}), ...(st.i ? { i: true } : {}), ...(st.u ? { u: true } : {}), ...(st.c ? { c: st.c } : {}) };
    if (last && sameStyle(last, run)) last.t += t;
    else cur.runs.push(run);
  };
  const walk = (node, st, blockType) => {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) {
        text(ch.nodeValue.replace(/\n/g, ' '), st);
        continue;
      }
      if (ch.nodeType !== 1) continue;
      const tag = ch.tagName;
      if (tag === 'BR') {
        // Et linjeskift sist i en blokk er bare nettleserens plassholder.
        if (ch.nextSibling) open(blockType || 'p');
        continue;
      }
      if (tag === 'UL' || tag === 'OL') {
        for (const li of ch.children) {
          open(tag === 'UL' ? 'ul' : 'ol');
          walk(li, styleOf(li, st), tag === 'UL' ? 'ul' : 'ol');
        }
        cur = null;
        continue;
      }
      if (tag === 'DIV' || tag === 'P' || tag === 'LI') {
        // Avsnittet lages først når det kommer tekst, så en <div> rundt en liste
        // ikke blir en tom linje. En tom linje (<div><br></div>) beholdes.
        const before = blocks.length;
        cur = null;
        pending = blockType || 'p';
        walk(ch, styleOf(ch, st), blockType);
        if (blocks.length === before && !ch.querySelector('ul,ol,div,p,li')) open(blockType || 'p');
        cur = null;
        pending = 'p';
        continue;
      }
      walk(ch, styleOf(ch, st), blockType);
    }
  };
  walk(root, {}, null);
  return cleanRich(blocks.length ? blocks : [{ type: 'p', runs: [] }]);
}

/* ----------------------- fet, kursiv, understreket ----------------------- */

const SENTINEL = 'flatr-markering';
const TAGS = { b: ['B', 'STRONG'], i: ['I', 'EM'], u: ['U'] };

const unwrap = (el) => {
  while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
  el.remove();
};

/** Er hver bokstav i utvalget allerede formatert med `tag`? */
function allInside(root, range, tag) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let any = false;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue || !range.intersectsNode(n)) continue;
    any = true;
    let p = n.parentNode;
    let found = false;
    while (p && p !== root) {
      if (TAGS[tag].includes(p.tagName)) found = true;
      p = p.parentNode;
    }
    if (!found) return false;
  }
  return any;
}

const closestTag = (node, tag, root) => {
  for (let p = node; p && p !== root; p = p.parentNode) if (p.nodeType === 1 && TAGS[tag].includes(p.tagName)) return p;
  return null;
};

/**
 * Slår fet (b), kursiv (i) eller understreket (u) av eller på for det som er
 * markert. Nettleserens egen «bold» tror at tekst som allerede er tykk (vekt
 * 600+) er fet, og fjerner den i stedet – derfor gjør vi det selv: utvalget
 * merkes med en midlertidig skrift (det deler tekstnodene riktig), og merkene
 * pakkes inn i <b>/<i>/<u> eller tas ut av dem.
 */
export function toggleInline(root, tag) {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed || !root.contains(sel.anchorNode)) return;
  const on = !allInside(root, sel.getRangeAt(0), tag);
  document.execCommand('styleWithCSS', false, false);
  document.execCommand('fontName', false, SENTINEL);
  const marks = [...root.querySelectorAll(`font[face="${SENTINEL}"]`)];
  for (const m of marks) {
    if (on) {
      const w = document.createElement(tag);
      m.parentNode.insertBefore(w, m);
      w.appendChild(m);
      continue;
    }
    // Del hver <b> rundt merket i biten før, merket og biten etter; bare merket mister formateringen.
    for (let b = closestTag(m.parentNode, tag, root); b; b = closestTag(m.parentNode, tag, root)) {
      const head = document.createRange();
      head.setStart(b, 0);
      head.setEndBefore(m);
      const before = head.extractContents();
      const tail = document.createRange();
      tail.setStartAfter(m);
      tail.setEnd(b, b.childNodes.length);
      const after = tail.extractContents();
      if (before.textContent) {
        const b1 = b.cloneNode(false);
        b1.appendChild(before);
        b.parentNode.insertBefore(b1, b);
      }
      if (after.textContent) {
        const b2 = b.cloneNode(false);
        b2.appendChild(after);
        b.parentNode.insertBefore(b2, b.nextSibling);
      }
      unwrap(b);
    }
    for (const inner of [...m.querySelectorAll(TAGS[tag].join(','))]) unwrap(inner);
  }
  // Fjern merkene, men behold markeringen (tomme tekstnoder som ankere).
  const startMarker = document.createTextNode('');
  const endMarker = document.createTextNode('');
  if (marks.length) {
    marks[0].parentNode.insertBefore(startMarker, marks[0]);
    const last = marks[marks.length - 1];
    last.parentNode.insertBefore(endMarker, last.nextSibling);
  }
  for (const m of marks) unwrap(m);
  if (startMarker.parentNode && endMarker.parentNode) {
    const r = document.createRange();
    r.setStartAfter(startMarker);
    r.setEndBefore(endMarker);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Kjører en redigeringskommando og setter markøren/markeringen tilbake på samme
 * sted i teksten. Chrome flytter markøren til starten av linja når en linje blir
 * et listepunkt, så det du skriver videre havnet ellers foran.
 */
export function keepSelection(root, fn) {
  const sel = window.getSelection();
  const r = sel.rangeCount ? sel.getRangeAt(0) : null;
  const offset = (node, off) => {
    const range = document.createRange();
    range.setStart(root, 0);
    range.setEnd(node, off);
    return range.toString().length;
  };
  const inside = r && root.contains(r.startContainer) && root.contains(r.endContainer);
  const start = inside ? offset(r.startContainer, r.startOffset) : null;
  const end = inside ? offset(r.endContainer, r.endOffset) : null;
  fn();
  if (start == null) return;
  const find = (target) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let left = target;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (left <= n.nodeValue.length) return [n, left];
      left -= n.nodeValue.length;
    }
    return [root, root.childNodes.length];
  };
  const [sn, so] = find(start);
  const [en, eo] = find(end);
  const next = document.createRange();
  next.setStart(sn, so);
  next.setEnd(en, eo);
  sel.removeAllRanges();
  sel.addRange(next);
}
