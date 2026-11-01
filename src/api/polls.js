// Avstemninger og spørsmål fra salen (Flatr-appen «Avstemning»).
//
// Admin:   GET/POST/PUT/DELETE /api/polls       – lage, åpne/lukke, nullstille, moderere
// Publikum: GET/POST /api/vote?t=<token>        – åpent; mobilsiden /v/<token> (src/public/Vote.jsx)
// Skjerm:   pollsData() via /api/feeds (apps.js) – resultatene, oppdatert hvert tredje sekund
//
// En stemme per nettleser («voter» er en tilfeldig id den lager selv) – den kan
// endres så lenge avstemningen er åpen. Grense per IP mot flom av stemmer.

import { json, badRequest, notFound, readJson, requireAdmin, toIntOrNull, safeJson } from './_shared.js';

const KINDS = ['choice', 'questions'];
const MAX_OPTIONS = 8;
const MAX_QUESTION = 200;
const VOTER = /^[A-Za-z0-9-]{8,64}$/;

const token = () => {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => abc[b % abc.length]).join('');
};

const cleanOptions = (list) =>
  (Array.isArray(list) ? list : [])
    .map((o) => String(o ?? '').trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, MAX_OPTIONS);

/** Resultatene for én avstemning, slik skjermen og mobilsiden viser dem. */
async function results(env, poll, { all = false } = {}) {
  const options = safeJson(poll.options, []);
  const base = {
    id: poll.id,
    kind: poll.kind,
    question: poll.question,
    options,
    status: poll.status,
    show_results: !!poll.show_results,
    moderate: !!poll.moderate,
    path: `/v/${poll.token}`
  };
  if (poll.kind === 'questions') {
    const { results: qs } = await env.DB.prepare(
      `SELECT id, text, likes, status, created_at FROM poll_questions WHERE poll_id = ? ${all ? '' : "AND status = 'shown'"}
        ORDER BY likes DESC, id DESC LIMIT ${all ? 200 : 30}`
    )
      .bind(poll.id)
      .all();
    return { ...base, questions: qs ?? [], total: (qs ?? []).length };
  }
  const { results: rows } = await env.DB.prepare('SELECT choice, COUNT(*) AS n FROM poll_votes WHERE poll_id = ? GROUP BY choice').bind(poll.id).all();
  const counts = options.map((_, i) => Number((rows ?? []).find((r) => r.choice === i)?.n) || 0);
  return { ...base, counts, total: counts.reduce((a, b) => a + b, 0) };
}

/** Alle avstemninger med resultater – data til skjermene (appData i apps.js). */
export async function pollsData(env) {
  const { results: polls } = await env.DB.prepare('SELECT * FROM polls ORDER BY id DESC LIMIT 50').all();
  const out = {};
  for (const p of polls ?? []) out[p.id] = await results(env, p);
  return { polls: out, origin: env.ORIGIN || '' };
}

/* --------------------------------- admin --------------------------------- */

export async function onRequestGet(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { env } = context;
  const { results: polls } = await env.DB.prepare('SELECT * FROM polls ORDER BY id DESC').all();
  const out = [];
  for (const p of polls ?? []) out.push({ ...(await results(env, p, { all: true })), created_at: p.created_at });
  return json({ polls: out, origin: env.ORIGIN || '' });
}

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const b = (await readJson(context.request)) || {};
  const kind = KINDS.includes(b.kind) ? b.kind : 'choice';
  const question = String(b.question || '').trim().slice(0, 200);
  if (!question) return badRequest('Skriv spørsmålet');
  const options = cleanOptions(b.options);
  if (kind === 'choice' && options.length < 2) return badRequest('Legg inn minst to svaralternativer');
  const row = await context.env.DB.prepare(
    'INSERT INTO polls (kind, question, options, show_results, moderate, token) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
  )
    .bind(kind, question, JSON.stringify(kind === 'choice' ? options : []), b.show_results === false ? 0 : 1, b.moderate ? 1 : 0, token())
    .first();
  return json(await results(context.env, row, { all: true }), { status: 201 });
}

// PUT /api/polls?id=1  { question?, options?, status?, show_results?, moderate?, reset? }
// PUT /api/polls?id=1&question=5  { status: 'shown' | 'hidden' }  – moderering
export async function onRequestPut(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { env, request } = context;
  const params = new URL(request.url).searchParams;
  const id = toIntOrNull(params.get('id'));
  const poll = id && (await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(id).first());
  if (!poll) return notFound('Avstemningen finnes ikke');
  const b = (await readJson(request)) || {};

  const qid = toIntOrNull(params.get('question'));
  if (qid) {
    await env.DB.prepare('UPDATE poll_questions SET status = ? WHERE id = ? AND poll_id = ?')
      .bind(b.status === 'hidden' ? 'hidden' : 'shown', qid, id)
      .run();
  } else {
    if (b.reset) {
      await env.DB.prepare('DELETE FROM poll_votes WHERE poll_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM poll_likes WHERE question_id IN (SELECT id FROM poll_questions WHERE poll_id = ?)').bind(id).run();
      await env.DB.prepare('DELETE FROM poll_questions WHERE poll_id = ?').bind(id).run();
    }
    const options = b.options !== undefined && poll.kind === 'choice' ? cleanOptions(b.options) : null;
    if (options && options.length < 2) return badRequest('Legg inn minst to svaralternativer');
    await env.DB.prepare('UPDATE polls SET question = ?, options = ?, status = ?, show_results = ?, moderate = ? WHERE id = ?')
      .bind(
        b.question !== undefined ? String(b.question).trim().slice(0, 200) || poll.question : poll.question,
        options ? JSON.stringify(options) : poll.options,
        b.status === 'closed' ? 'closed' : b.status === 'open' ? 'open' : poll.status,
        b.show_results !== undefined ? (b.show_results ? 1 : 0) : poll.show_results,
        b.moderate !== undefined ? (b.moderate ? 1 : 0) : poll.moderate,
        id
      )
      .run();
  }
  const row = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(id).first();
  return json(await results(env, row, { all: true }));
}

export async function onRequestDelete(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const id = toIntOrNull(new URL(context.request.url).searchParams.get('id'));
  if (!id) return badRequest('id er påkrevd');
  await context.env.DB.prepare('DELETE FROM polls WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

/* -------------------------------- publikum -------------------------------- */

// Grenser per minutt (i minnet, per server): 20 per mobil, og 300 per IP – på en
// konferanse deler hundrevis av folk samme nettverk.
const hits = new Map();
function tooMany(key, limit) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return list.length > limit;
}

async function pollByToken(env, request) {
  const t = String(new URL(request.url).searchParams.get('t') || '');
  if (!/^[a-z0-9]{6,16}$/.test(t)) return null;
  return env.DB.prepare('SELECT * FROM polls WHERE token = ?').bind(t).first();
}

/** Det mobilsiden viser: spørsmålet, valgene, egen stemme, og resultatene når de er synlige. */
async function publicView(env, poll, voter) {
  const r = await results(env, poll);
  const visible = r.show_results || r.status === 'closed';
  let mine = null;
  let liked = [];
  if (VOTER.test(voter || '')) {
    if (poll.kind === 'choice') mine = (await env.DB.prepare('SELECT choice FROM poll_votes WHERE poll_id = ? AND voter = ?').bind(poll.id, voter).first())?.choice ?? null;
    else liked = ((await env.DB.prepare('SELECT l.question_id FROM poll_likes l JOIN poll_questions q ON q.id = l.question_id WHERE q.poll_id = ? AND l.voter = ?').bind(poll.id, voter).all()).results ?? []).map((x) => x.question_id);
  }
  return {
    kind: r.kind,
    question: r.question,
    options: r.options,
    status: r.status,
    moderate: r.moderate,
    mine,
    liked,
    ...(poll.kind === 'questions' ? { questions: r.questions.map(({ id, text, likes }) => ({ id, text, likes })) } : visible ? { counts: r.counts, total: r.total } : { total: r.total })
  };
}

export const vote = {
  async onRequestGet({ request, env }) {
    const poll = await pollByToken(env, request);
    if (!poll) return notFound('Avstemningen finnes ikke');
    return json(await publicView(env, poll, new URL(request.url).searchParams.get('voter')), { headers: { 'Cache-Control': 'no-store' } });
  },

  // { voter, choice } | { voter, question } | { voter, like }
  async onRequestPost({ request, env }) {
    const poll = await pollByToken(env, request);
    if (!poll) return notFound('Avstemningen finnes ikke');
    if (poll.status !== 'open') return json({ error: 'Avstemningen er avsluttet' }, { status: 409 });
    const b = (await readJson(request)) || {};
    if (!VOTER.test(b.voter || '')) return badRequest('Mangler id');
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
    if (tooMany(`${poll.id}:v:${b.voter}`, 20) || tooMany(`${poll.id}:ip:${ip}`, 300)) {
      return json({ error: 'For mange forsøk. Vent litt.' }, { status: 429 });
    }

    if (poll.kind === 'choice') {
      const choice = toIntOrNull(b.choice);
      if (choice == null || choice < 0 || choice >= safeJson(poll.options, []).length) return badRequest('Ugyldig valg');
      await env.DB.prepare(
        `INSERT INTO poll_votes (poll_id, voter, choice) VALUES (?, ?, ?)
         ON CONFLICT(poll_id, voter) DO UPDATE SET choice = excluded.choice, created_at = excluded.created_at`
      )
        .bind(poll.id, b.voter, choice)
        .run();
    } else if (b.like != null) {
      const q = await env.DB.prepare(`SELECT id FROM poll_questions WHERE id = ? AND poll_id = ? AND status = 'shown'`).bind(toIntOrNull(b.like), poll.id).first();
      if (!q) return notFound('Spørsmålet finnes ikke');
      const added = await env.DB.prepare('INSERT OR IGNORE INTO poll_likes (question_id, voter) VALUES (?, ?)').bind(q.id, b.voter).run();
      if (added.meta?.changes ?? added.changes) await env.DB.prepare('UPDATE poll_questions SET likes = likes + 1 WHERE id = ?').bind(q.id).run();
    } else {
      const text = String(b.question || '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION);
      if (text.length < 3) return badRequest('Skriv et spørsmål');
      await env.DB.prepare('INSERT INTO poll_questions (poll_id, voter, text, status) VALUES (?, ?, ?, ?)')
        .bind(poll.id, b.voter, text, poll.moderate ? 'pending' : 'shown')
        .run();
    }
    return json(await publicView(env, poll, b.voter));
  }
};
