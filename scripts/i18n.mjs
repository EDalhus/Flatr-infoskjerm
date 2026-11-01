// Verktøy for språk i Flatr (se src/lib/i18n.js).
//
//   node scripts/i18n.mjs wrap <filer …>     pakker synlig norsk tekst inn i tr(…)
//   node scripts/i18n.mjs keys               alle tekstene i tr(…) (JSON på stdout)
//   node scripts/i18n.mjs missing en         tekster som mangler i src/locales/en.json
//   node scripts/i18n.mjs leftovers <filer>  norsk tekst som fortsatt står uten tr(…)
//
// wrap leser filene med @babel/parser og endrer bare tekstene (på nøyaktige
// posisjoner i kildeteksten), så resten av filen står urørt. Den tar:
//   - tekst i JSX, og synlige props (placeholder, title, label …)
//   - strenger og malstrenger i {…} i JSX (også i ?: og &&)
//   - strenger i setError(…), confirm(…), new Error(…), document.title = …
//   - verdier for label/title/text/hint … i objekter (menyer, valglister)
// Malstrenger blir tr('… {0} …', [uttrykk]). Kjør to ganger, så tas også
// strengene inne i uttrykkene. Se over resultatet – det er et hjelpemiddel.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const I18N = path.join(ROOT, 'src/lib/i18n.js');

const VISIBLE_ATTRS = new Set(['placeholder', 'title', 'label', 'aria-label', 'alt', 'hint', 'subtitle', 'heading', 'text', 'note', 'description', 'tagline', 'eyebrow', 'kicker', 'button', 'empty', 'confirmText']);
const DISPLAY_KEYS = new Set(['label', 'title', 'text', 'hint', 'description', 'placeholder', 'subtitle', 'tagline', 'heading', 'intro', 'outro', 'button', 'q', 'a', 'note', 'help', 'empty', 'cta', 'short', 'body']);
const CALLS = new Set(['setError', 'setNotice', 'setFlash', 'setInfo', 'setStatus', 'setErr', 'confirm', 'alert', 'prompt', 'setOk', 'setDone', 'useState']);

const LETTER = /[A-Za-zÆØÅæøå]/;
// Navn og enheter som er like på alle språk.
const SAME = new Set(['Flatr', 'Flatr Apps', 'Apps', 'Pro', 'GB', 'MB', 'kB', 'TB', 'API', 'JSON', 'PDF', 'CSV', 'URL', 'AIS', 'NAIS', 'QR', 'OK', 'ID', 'Apple TV', 'Android TV', 'Google TV', 'Google', 'Microsoft', 'Stripe', 'Claude', 'Claude AI', 'Cursor', 'Cursor AI', 'YouTube', 'Vimeo', 'Yr', 'Entur', 'Zapier', 'Make', 'Power Automate', 'iCal', 'RSS', 'Slack', 'Teams']);
const isCssLike = (s) => s.includes('-') && s.trim().split(/\s+/).every((w) => /^[!a-z0-9:[\]/.%()#_,=&>+*-]+$/.test(w));

/** Ser teksten ut som noe en person skal lese (ikke en nøkkel, klasse eller adresse)? */
function isDisplay(s) {
  const v = String(s).trim();
  if (!v || !LETTER.test(v) || SAME.has(v)) return false;
  if (/^(https?:|mailto:|\/|#|\.|data:)/.test(v) || /^[\w.+-]+@[\w.-]+$/.test(v)) return false;
  if (isCssLike(v)) return false;
  if (!/\s/.test(v)) return /^[A-ZÆØÅ]/.test(v) || /[æøåÆØÅ]/.test(v);
  return true;
}

const decodeEntities = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");

const q = (s) => JSON.stringify(s).replace(/^"|"$/g, '').replace(/'/g, "\\'");
const lit = (s) => `'${q(s)}'`;

function parseFile(src) {
  return parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
}

function walk(node, ancestors, visit) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node, ancestors) === false) return;
  ancestors.push(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
    const v = node[key];
    if (Array.isArray(v)) for (const c of v) walk(c, ancestors, visit);
    else if (v && typeof v.type === 'string') walk(v, ancestors, visit);
  }
  ancestors.pop();
}

const isTrCall = (n) => n?.type === 'CallExpression' && n.callee?.type === 'Identifier' && n.callee.name === 'tr';

/** Er en streng i {…} i JSX noe som vises? Går opp gjennom ?:, &&, || og + til JSX-en. */
function inJsxDisplay(ancestors, node) {
  let child = node;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (a.type === 'ConditionalExpression') {
      if (a.test === child) return false;
    } else if (a.type === 'LogicalExpression' || a.type === 'ParenthesizedExpression') {
      /* gjennom */
    } else if (a.type === 'BinaryExpression') {
      if (a.operator !== '+') return false;
    } else if (a.type === 'JSXExpressionContainer') {
      const p = ancestors[i - 1];
      if (p?.type === 'JSXElement' || p?.type === 'JSXFragment') return true;
      if (p?.type === 'JSXAttribute') return VISIBLE_ATTRS.has(p.name?.name);
      return false;
    } else return false;
    child = a;
  }
  return false;
}

function displayContext(node, ancestors) {
  // Gå opp gjennom ?: (ikke testen), &&, || og parenteser til det som bruker verdien.
  let child = node;
  let i = ancestors.length - 1;
  while (i >= 0) {
    const a = ancestors[i];
    if ((a.type === 'ConditionalExpression' && a.test !== child) || a.type === 'LogicalExpression' || a.type === 'ParenthesizedExpression') {
      child = a;
      i--;
    } else break;
  }
  const parent = ancestors[i];
  if (!parent || isTrCall(parent)) return false;
  if (parent.type === 'JSXAttribute') return VISIBLE_ATTRS.has(parent.name?.name);
  if (parent.type === 'JSXExpressionContainer') {
    const p = ancestors[i - 1];
    return p?.type === 'JSXElement' || p?.type === 'JSXFragment' || (p?.type === 'JSXAttribute' && VISIBLE_ATTRS.has(p.name?.name));
  }
  if (parent.type === 'BinaryExpression') return parent.operator === '+' && inJsxDisplay(ancestors, node);
  if (parent.type === 'CallExpression' && parent.arguments.includes(child)) {
    const c = parent.callee;
    const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : null;
    return CALLS.has(name);
  }
  if (parent.type === 'NewExpression') return parent.callee?.name === 'Error' && parent.arguments[0] === child;
  if (parent.type === 'ObjectProperty') return parent.value === child && !parent.computed && DISPLAY_KEYS.has(parent.key?.name ?? parent.key?.value);
  if (parent.type === 'AssignmentExpression') return parent.right === child && parent.left?.type === 'MemberExpression' && parent.left.object?.name === 'document' && parent.left.property?.name === 'title';
  // Andre runde: strengene i variablene til tr('… {0} …', [n === 1 ? 'skjerm' : 'skjermer']).
  if (parent.type === 'ArrayExpression') return isTrCall(ancestors[i - 1]) && ancestors[i - 1].arguments[1] === parent;
  return false;
}

function wrapSource(src, file) {
  const ast = parseFile(src);
  const edits = [];
  walk(ast.program, [], (node, ancestors) => {
    if (node.type === 'JSXText') {
      const raw = node.value;
      if (!LETTER.test(raw)) return;
      const lead = raw.match(/^\s*/)[0];
      const tail = raw.match(/\s*$/)[0];
      const inner = decodeEntities(raw.slice(lead.length, raw.length - tail.length).replace(/\s*\n\s*/g, ' '));
      if (!inner || /[{}]/.test(inner) || SAME.has(inner)) return;
      edits.push({ start: node.start + lead.length, end: node.end - tail.length, text: `{tr(${lit(inner)})}` });
      return;
    }
    if (node.type === 'StringLiteral') {
      if (!isDisplay(node.value) || !displayContext(node, ancestors)) return;
      const parent = ancestors[ancestors.length - 1];
      const call = `tr(${lit(node.value)})`;
      edits.push({ start: node.start, end: node.end, text: parent.type === 'JSXAttribute' ? `{${call}}` : call });
      return false;
    }
    if (node.type === 'TemplateLiteral') {
      const parentT = ancestors[ancestors.length - 1];
      if (parentT?.type === 'TaggedTemplateExpression') return;
      const parts = node.quasis.map((x) => x.value.cooked ?? x.value.raw);
      const joined = parts.join(' ');
      if (!LETTER.test(joined) || isCssLike(joined) || parts.some((p) => /[{}]/.test(p))) return;
      if (!isDisplay(parts.join('X')) || !displayContext(node, ancestors)) return;
      let fmt = '';
      parts.forEach((p, i) => {
        fmt += p;
        if (i < node.expressions.length) fmt += `{${i}}`;
      });
      const vars = node.expressions.map((e) => src.slice(e.start, e.end));
      const call = vars.length ? `tr(${lit(fmt)}, [${vars.join(', ')}])` : `tr(${lit(fmt)})`;
      edits.push({ start: node.start, end: node.end, text: call });
      return false;
    }
  });
  if (!edits.length) return { src, count: 0 };
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  let lastStart = Infinity;
  let count = 0;
  for (const e of edits) {
    if (e.end > lastStart) continue; // overlapper (den ytre vant)
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    lastStart = e.start;
    count++;
  }
  return { src: ensureImport(out, file), count };
}

function ensureImport(src, file) {
  let rel = path.relative(path.dirname(file), I18N).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  const existing = src.match(new RegExp(`import \\{([^}]*)\\} from '${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}';`));
  if (existing) {
    if (/\btr\b/.test(existing[1])) return src;
    return src.replace(existing[0], `import {${existing[1].trimEnd()}, tr } from '${rel}';`);
  }
  const ast = parseFile(src);
  const imports = ast.program.body.filter((n) => n.type === 'ImportDeclaration');
  const at = imports.length ? imports[imports.length - 1].end : 0;
  return `${src.slice(0, at)}\nimport { tr } from '${rel}';${src.slice(at)}`;
}

function trKeys(file) {
  const keys = [];
  walk(parseFile(fs.readFileSync(file, 'utf8')).program, [], (node) => {
    if (isTrCall(node) && node.arguments[0]?.type === 'StringLiteral') keys.push(node.arguments[0].value);
  });
  return keys;
}

const sourceFiles = () => {
  const out = [];
  const go = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) go(p);
      else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
    }
  };
  go(path.join(ROOT, 'src'));
  return out;
};

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'wrap') {
  let total = 0;
  for (const f of args) {
    const file = path.resolve(f);
    const src = fs.readFileSync(file, 'utf8');
    const { src: out, count } = wrapSource(src, file);
    if (count) fs.writeFileSync(file, out);
    total += count;
    console.log(`${String(count).padStart(4)}  ${path.relative(ROOT, file)}`);
  }
  console.log(`${total} tekster pakket inn`);
} else if (cmd === 'keys' || cmd === 'missing') {
  const keys = [...new Set(sourceFiles().flatMap(trKeys))].sort((a, b) => a.localeCompare(b, 'nb'));
  if (cmd === 'keys') console.log(JSON.stringify(keys, null, 2));
  else {
    const dictFile = path.join(ROOT, 'src/locales', `${args[0] || 'en'}.json`);
    const dict = fs.existsSync(dictFile) ? JSON.parse(fs.readFileSync(dictFile, 'utf8')) : {};
    const missing = keys.filter((k) => !(k in dict));
    console.log(JSON.stringify(missing, null, 2));
    console.error(`${missing.length} av ${keys.length} mangler i ${path.relative(ROOT, dictFile)}`);
  }
} else if (cmd === 'leftovers') {
  for (const f of args) {
    const src = fs.readFileSync(f, 'utf8');
    const hits = [];
    walk(parseFile(src).program, [], (node, ancestors) => {
      if (isTrCall(node)) return false;
      if ((node.type === 'StringLiteral' && /[æøåÆØÅ]/.test(node.value)) || (node.type === 'JSXText' && /[æøåÆØÅ]/.test(node.value))) {
        if (ancestors[ancestors.length - 1]?.type === 'ImportDeclaration') return;
        hits.push(`${node.loc.start.line}: ${String(node.value).trim().slice(0, 90)}`);
      }
      if (node.type === 'TemplateLiteral' && node.quasis.some((x) => /[æøåÆØÅ]|\b(og|ikke|skjerm|skjermer|av|til|på|fra)\b/.test(x.value.raw))) {
        hits.push(`${node.loc.start.line}: \`${node.quasis.map((x) => x.value.raw).join('${…}').slice(0, 90)}\``);
      }
    });
    if (hits.length) console.log(`--- ${path.relative(ROOT, path.resolve(f))}\n${hits.join('\n')}`);
  }
} else {
  console.log('Bruk: node scripts/i18n.mjs wrap|keys|missing|leftovers …');
}
