import { json, badRequest, notFound, handleOptions, readJson, requireAdmin, toIntOrNull, safeJson, approvalRequired } from './_shared.js';
import { saveVersion, currentDeck } from './versions.js';
import { logActivity } from './activity.js';

// Godkjenning før publisering (Team → «Krev godkjenning»). Når det er på,
// viser skjermene siste publiserte versjon av hver presentasjon; endringer er
// et utkast til en eier publiserer dem.
//
//   GET  /api/review?playlist=1                 -> status
//   POST /api/review?playlist=1&action=request  { note? }  (alle)  -> be om godkjenning
//   POST /api/review?playlist=1&action=publish                (eier) -> publiser utkastet
//   POST /api/review?playlist=1&action=reject   { note? }  (eier) -> avvis
//   PUT  /api/review  { required: bool }                      (eier) -> slå av/på for kontoen

const isOwner = (env) => !env.SESSION_USER || env.SESSION_USER.role === 'owner';
const who = (env) => env.SESSION_USER?.name || env.SESSION_USER?.email || null;

async function status(env, playlistId) {
  const pl = await env.DB.prepare('SELECT id, name, published_version_id, review_requested_at, review_requested_by, review_note FROM playlists WHERE id = ?').bind(playlistId).first();
  if (!pl) return null;
  const required = await approvalRequired(env);
  let published = null;
  let changed = false;
  if (pl.published_version_id) {
    published = await env.DB.prepare('SELECT id, created_at, author, data FROM playlist_versions WHERE id = ?').bind(pl.published_version_id).first();
    if (published) changed = JSON.stringify(await currentDeck(env, playlistId)) !== published.data;
  }
  return {
    required,
    published: published ? { id: published.id, at: published.created_at, by: published.author } : null,
    has_changes: required && (!published || changed),
    requested: pl.review_requested_at ? { at: pl.review_requested_at, by: pl.review_requested_by, note: pl.review_note } : null,
    note: !pl.review_requested_at ? pl.review_note : null, // f.eks. «Avvist: …»
    can_publish: isOwner(env)
  };
}

/** Publiser: lagre som versjon og la skjermene vise den. */
export async function publish(env, playlistId) {
  const id = await saveVersion(env, playlistId, { author: who(env), kind: 'published' });
  await env.DB.prepare('UPDATE playlists SET published_version_id = ?, review_requested_at = NULL, review_requested_by = NULL, review_note = NULL WHERE id = ?')
    .bind(id, playlistId)
    .run();
  return id;
}

export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const playlistId = toIntOrNull(params.get('playlist'));
  if (!playlistId) {
    // Oversikt: hvilke presentasjoner som venter på godkjenning.
    const { results } = await env.DB.prepare('SELECT id, name, review_requested_at, review_requested_by FROM playlists WHERE review_requested_at IS NOT NULL').all();
    return json({ required: await approvalRequired(env), pending: results || [] });
  }
  const s = await status(env, playlistId);
  return s ? json(s) : notFound('Presentasjonen finnes ikke');
}

export async function onRequestPut(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { env, request } = context;
  if (!isOwner(env)) return json({ error: 'Bare eiere kan endre dette.' }, { status: 403 });
  const b = (await readJson(request)) || {};
  const on = b.required === true;
  if (on && !(await approvalRequired(env))) {
    // Slik alt ser ut nå, blir publisert – skjermene endrer seg ikke når det slås på.
    const { results } = await env.DB.prepare('SELECT id FROM playlists').all();
    for (const p of results || []) await publish(env, p.id);
  }
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('require_approval', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(on ? '1' : '0')
    .run();
  await logActivity(env, env.SESSION_USER, { action: on ? 'slo på godkjenning før publisering' : 'slo av godkjenning før publisering', target_type: 'settings' });
  return json({ required: on });
}

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { env, request } = context;
  const params = new URL(request.url).searchParams;
  const playlistId = toIntOrNull(params.get('playlist'));
  const action = params.get('action');
  const pl = playlistId && (await env.DB.prepare('SELECT id, name, review_requested_by FROM playlists WHERE id = ?').bind(playlistId).first());
  if (!pl) return notFound('Presentasjonen finnes ikke');
  if (!(await approvalRequired(env))) return badRequest('Godkjenning er ikke slått på');
  const b = (await readJson(request)) || {};
  const note = String(b.note || '').trim().slice(0, 500) || null;
  const path = `/admin?view=playlists&edit=${pl.id}`;

  if (action === 'request') {
    await env.DB.prepare(`UPDATE playlists SET review_requested_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), review_requested_by = ?, review_note = ? WHERE id = ?`)
      .bind(env.SESSION_USER?.email || who(env), note, pl.id)
      .run();
    await logActivity(env, env.SESSION_USER, { action: 'ba om godkjenning av', target_type: 'playlist', target_id: pl.id, target_name: pl.name, detail: note });
    await env.NOTIFY?.({
      exclude: env.SESSION_USER?.email,
      subject: `${who(env) || 'Noen'} ber om godkjenning av «${pl.name}»`,
      intro: note ? `«${note}» Åpne presentasjonen for å se endringene og publisere dem.` : 'Åpne presentasjonen for å se endringene og publisere dem til skjermene.',
      button: 'Se og godkjenn',
      path,
      webhook: true
    });
    return json(await status(env, pl.id));
  }

  if (!isOwner(env)) return json({ error: 'Bare eiere kan publisere og avvise.' }, { status: 403 });

  if (action === 'publish') {
    const requester = pl.review_requested_by;
    await publish(env, pl.id);
    await logActivity(env, env.SESSION_USER, { action: 'publiserte', target_type: 'playlist', target_id: pl.id, target_name: pl.name });
    if (requester && requester.includes('@') && requester !== env.SESSION_USER?.email) {
      await env.NOTIFY?.({ to: requester, subject: `«${pl.name}» er publisert`, intro: `${who(env) || 'En eier'} har godkjent endringene, og de vises nå på skjermene.`, button: 'Åpne presentasjonen', path });
    }
    return json(await status(env, pl.id));
  }

  if (action === 'reject') {
    const requester = pl.review_requested_by;
    await env.DB.prepare('UPDATE playlists SET review_requested_at = NULL, review_requested_by = NULL, review_note = ? WHERE id = ?')
      .bind(`Avvist av ${who(env) || 'en eier'}${note ? `: ${note}` : ''}`, pl.id)
      .run();
    await logActivity(env, env.SESSION_USER, { action: 'avviste endringene i', target_type: 'playlist', target_id: pl.id, target_name: pl.name, detail: note });
    if (requester && requester.includes('@')) {
      await env.NOTIFY?.({ to: requester, subject: `Endringene i «${pl.name}» ble ikke godkjent`, intro: note ? `${who(env)}: «${note}»` : `${who(env)} har avvist endringene. Ta en titt og send på nytt.`, button: 'Åpne presentasjonen', path });
    }
    return json(await status(env, pl.id));
  }
  return badRequest('Ukjent handling');
}

export const onRequestOptions = handleOptions;
