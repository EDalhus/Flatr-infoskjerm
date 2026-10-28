import { json, badRequest, notFound, handleOptions, readJson, requireAdmin, toIntOrNull } from './_shared.js';
import { logActivity } from './activity.js';

// Kommentarer i editoren: på et lysbilde, eventuelt et element, med svar og
// @-omtaler. De som nevnes (og den som startet tråden, ved svar) får e-post.
// Lesere kan også kommentere (se ALWAYS_ALLOWED / leser-sperren i server/index.js).
//
//   GET    /api/comments?playlist=1     -> { comments, members }
//   POST   /api/comments  { playlist_id, slide_id, element_id?, parent_id?, body, mentions: [e-post] }
//   PUT    /api/comments?id=1  { resolved? , body? }
//   DELETE /api/comments?id=1

const me = (env) => env.SESSION_USER || {};

export async function onRequestGet({ request, env }) {
  const playlistId = toIntOrNull(new URL(request.url).searchParams.get('playlist'));
  if (!playlistId) return badRequest('playlist er påkrevd');
  const { results } = await env.DB.prepare('SELECT * FROM comments WHERE playlist_id = ? ORDER BY id').bind(playlistId).all();
  const members = env.TEAM ? env.TEAM().map((m) => ({ email: m.email, name: m.name || m.email.split('@')[0] })) : [];
  return json({ comments: results || [], members, me: me(env).email || null });
}

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { env, request } = context;
  const b = (await readJson(request)) || {};
  const playlistId = toIntOrNull(b.playlist_id);
  const body = String(b.body || '').trim().slice(0, 2000);
  if (!playlistId || !body) return badRequest('Skriv en kommentar');
  const pl = await env.DB.prepare('SELECT id, name FROM playlists WHERE id = ?').bind(playlistId).first();
  if (!pl) return notFound('Presentasjonen finnes ikke');
  const parent = toIntOrNull(b.parent_id) ? await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(toIntOrNull(b.parent_id)).first() : null;
  const row = await env.DB.prepare(
    'INSERT INTO comments (playlist_id, slide_id, element_id, parent_id, author_email, author_name, body) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *'
  )
    .bind(playlistId, parent?.slide_id ?? toIntOrNull(b.slide_id), parent?.element_id ?? toIntOrNull(b.element_id), parent?.id ?? null, me(env).email || null, me(env).name || null, body)
    .first();
  await logActivity(env, me(env), { action: 'kommenterte', target_type: 'playlist', target_id: pl.id, target_name: pl.name, detail: body.slice(0, 160) });

  // Varsle de som er nevnt (bare medlemmer av kontoen) og trådstarteren ved svar.
  const team = new Set((env.TEAM ? env.TEAM() : []).map((m) => m.email));
  const to = new Set((Array.isArray(b.mentions) ? b.mentions : []).filter((e) => team.has(e)));
  if (parent?.author_email && team.has(parent.author_email)) to.add(parent.author_email);
  to.delete(me(env).email);
  if (to.size && env.NOTIFY) {
    const who = me(env).name || me(env).email || 'Noen';
    await env.NOTIFY({
      to: [...to],
      subject: `${who} ${parent ? 'svarte' : 'nevnte deg'} i «${pl.name}»`,
      intro: `«${body.slice(0, 400)}»`,
      button: 'Åpne kommentaren',
      path: `/admin?view=playlists&edit=${pl.id}&comments=1`
    });
  }
  return json(row, { status: 201 });
}

export async function onRequestPut(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { env, request } = context;
  const id = toIntOrNull(new URL(request.url).searchParams.get('id'));
  const row = id && (await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first());
  if (!row) return notFound('Kommentaren finnes ikke');
  const b = (await readJson(request)) || {};
  if (b.resolved !== undefined) await env.DB.prepare('UPDATE comments SET resolved = ? WHERE id = ? OR parent_id = ?').bind(b.resolved ? 1 : 0, id, id).run();
  if (typeof b.body === 'string') {
    if (row.author_email !== me(env).email) return json({ error: 'Du kan bare endre dine egne kommentarer' }, { status: 403 });
    await env.DB.prepare('UPDATE comments SET body = ? WHERE id = ?').bind(b.body.trim().slice(0, 2000), id).run();
  }
  return json(await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first());
}

export async function onRequestDelete(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { env, request } = context;
  const id = toIntOrNull(new URL(request.url).searchParams.get('id'));
  const row = id && (await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first());
  if (!row) return notFound('Kommentaren finnes ikke');
  if (row.author_email !== me(env).email && me(env).role !== 'owner') return json({ error: 'Du kan bare slette dine egne kommentarer' }, { status: 403 });
  await env.DB.prepare('DELETE FROM comments WHERE id = ? OR parent_id = ?').bind(id, id).run();
  return json({ ok: true });
}

export const onRequestOptions = handleOptions;
