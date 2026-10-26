// Tynn klient mot /api. Admin-token (hvis satt) legges på som Bearer.

const BASE = '/api';
const TOKEN_KEY = 'infoscreen.adminToken';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function req(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || `${res.status} ${res.statusText}`), {
      status: res.status,
      data
    });
  }
  return data;
}

/** POST av en fil med fremdrift (0–1). Svarer med JSON-kroppen. */
function xhrUpload(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ikke JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.error || `${xhr.status} ${xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error('Nettverksfeil under opplasting'));
    xhr.send(file);
  });
}

const viewerQuery = (target) => {
  if (target && typeof target === 'object') return `?playlist=${encodeURIComponent(target.playlist)}`;
  return target ? `?screen=${encodeURIComponent(target)}` : '';
};

const crud = (resource) => ({
  list: (query = '') => req(`/${resource}${query}`),
  create: (body) => req(`/${resource}`, { method: 'POST', body }),
  update: (id, body) => req(`/${resource}?id=${encodeURIComponent(id)}`, { method: 'PUT', body }),
  remove: (id) => req(`/${resource}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
});

export const api = {
  screens: {
    ...crud('screens'),
    duplicate: (id, name) => req('/screens', { method: 'POST', body: { duplicate_of: id, name } })
  },
  schedule: crud('schedule'),
  sponsors: crud('sponsors'),
  categories: crud('categories'),
  timeslots: {
    list: (screenId) => req(`/timeslots${screenId ? `?screen=${encodeURIComponent(screenId)}` : ''}`),
    create: (body) => req('/timeslots', { method: 'POST', body }),
    update: (id, body) => req(`/timeslots?id=${encodeURIComponent(id)}`, { method: 'PUT', body }),
    remove: (id) => req(`/timeslots?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  reports: (from, to) => req(`/reports?${new URLSearchParams({ from, to })}`),
  settings: {
    get: () => req('/settings'),
    update: (body) => req('/settings', { method: 'PUT', body })
  },
  playlists: {
    list: () => req('/playlists'),
    get: (id) => req(`/playlists?id=${encodeURIComponent(id)}`),
    create: (body) => req('/playlists', { method: 'POST', body }),
    update: (id, body) => req(`/playlists?id=${encodeURIComponent(id)}`, { method: 'PUT', body }),
    remove: (id) => req(`/playlists?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    duplicate: (id, name) => req('/playlists', { method: 'POST', body: { duplicate_of: id, name } })
  },
  deck: {
    get: (playlistId) => req(`/deck?playlist=${encodeURIComponent(playlistId)}`),
    slide: {
      get: (id) => req(`/deck-slides?id=${encodeURIComponent(id)}`),
      create: (body) => req('/deck-slides', { method: 'POST', body }),
      update: (id, body) => req(`/deck-slides?id=${encodeURIComponent(id)}`, { method: 'PUT', body }),
      remove: (id) => req(`/deck-slides?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
      duplicate: (id) => req('/deck-slides', { method: 'POST', body: { duplicate_of: id } })
    },
    element: {
      create: (body) => req('/deck-elements', { method: 'POST', body }),
      update: (id, body) => req(`/deck-elements?id=${encodeURIComponent(id)}`, { method: 'PUT', body }),
      remove: (id) => req(`/deck-elements?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    }
  },
  market: {
    list: (params = {}) => req(`/market?${new URLSearchParams(Object.entries(params).filter(([, v]) => v))}`),
    publish: (body) => req('/market', { method: 'POST', body }),
    install: (id, body = {}) => req('/market/install', { method: 'POST', body: { id, ...body } }),
    remove: (id) => req(`/market?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  templates: {
    list: (kind) => req(`/templates${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),
    get: (id) => req(`/templates?id=${encodeURIComponent(id)}`),
    create: (body) => req('/templates', { method: 'POST', body }),
    remove: (id) => req(`/templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  trash: {
    list: () => req('/trash'),
    restore: (id) => req(`/trash?id=${encodeURIComponent(id)}`, { method: 'POST' }),
    purge: (id) => req(`/trash?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    empty: () => req('/trash?all=1', { method: 'DELETE' })
  },
  health: () => req('/health'),
  media: {
    list: () => req('/media'),
    get: (id) => req(`/media?id=${encodeURIComponent(id)}`),
    update: (id, body) => req(`/media?id=${encodeURIComponent(id)}`, { method: 'PUT', body }),
    remove: (id) => req(`/media?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    url: (id) => `${BASE}/media?id=${encodeURIComponent(id)}&raw=1`,
    upload: (file, folder) => api.media.uploadWithProgress(file, folder),
    // Opplasting med fremdrift (fetch kan ikke rapportere opplastingsfremdrift).
    uploadWithProgress: (file, folder, onProgress) => {
      const q = new URLSearchParams({ name: file.name, type: file.type || 'application/octet-stream' });
      if (folder) q.set('folder', folder);
      return xhrUpload(`${BASE}/media?${q}`, file, onProgress);
    }
  },
  // Dokument (PDF/PowerPoint …) -> lysbilder. Gir { job }; følg med status().
  imports: {
    start: (file, { playlistId, duration }, onProgress) => {
      const q = new URLSearchParams({ playlist_id: playlistId, name: file.name, duration: duration ?? 10 });
      return xhrUpload(`${BASE}/import?${q}`, file, onProgress);
    },
    status: (job) => req(`/import?job=${encodeURIComponent(job)}`)
  },
  alerts: {
    list: (all = false) => req(`/alerts${all ? '?all=1' : ''}`),
    create: (body) => req('/alerts', { method: 'POST', body }),
    dismiss: (id) => req(`/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    dismissAll: () => req('/alerts?all=1', { method: 'DELETE' })
  },
  pairing: {
    // Admin: koble en kode (vist på TV-en) til en skjerm. `target` er en
    // skjerm-id (TV-en tar over skjermen) eller { name, playlist_id } for en ny skjerm.
    link: (pairing_code, target) =>
      req('/pairing/link', {
        method: 'POST',
        body: typeof target === 'object' ? { pairing_code, new_screen: target } : { pairing_code, screen_id: target }
      }),
    // Admin: liste over parringer (pending + paired + client_info).
    list: () => req('/pairing'),
    // Admin: flytt en paret enhet til en annen skjerm (TV-en trenger ikke røres).
    reassign: (device_id, screen_id) =>
      req('/pairing/reassign', { method: 'POST', body: { device_id, screen_id } }),
    // Admin: sett/fjern kallenavn på en enhet (tom streng fjerner).
    rename: (device_id, label) =>
      req('/pairing/rename', { method: 'POST', body: { device_id, label } }),
    // Admin: tagger på én eller flere enheter. mode 'add' legger til, ellers erstattes.
    tags: (device_ids, tags, mode = 'set') =>
      req('/pairing/tags', { method: 'POST', body: { device_ids, tags, mode } }),
    screenshotUrl: (device_id, v = '') =>
      `${BASE}/pairing/screenshot?device_id=${encodeURIComponent(device_id)}&v=${encodeURIComponent(v || '')}`,
    // Admin: kø en fjernkommando (identify | reload | clear_cache | reboot | screenshot).
    command: (body) => req('/pairing/command', { method: 'POST', body }),
    // Admin: opphev en paring (device_id eller screen_id).
    unpair: (body) => req('/pairing/unpair', { method: 'POST', body })
  },
  me: () => {
    // ?as=<navn> forwardes lokalt for fler-bruker-testing (ignoreres i prod).
    const as =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('as');
    return req(`/me${as ? `?as=${encodeURIComponent(as)}` : ''}`);
  },
  // Plattform (Node-serveren): hvilken del av Flatr vi er på + innlogging.
  context: () => req('/context'),
  auth: {
    request: (email) => req('/auth/request', { method: 'POST', body: { email } }),
    logout: () => req('/auth/logout', { method: 'POST' })
  },
  prefs: (patch) => req('/prefs', { method: 'PUT', body: patch }),
  team: {
    list: () => req('/team'),
    invite: (email, role) => req('/team', { method: 'POST', body: { email, role } }),
    setRole: (userId, role) =>
      req(`/team?user_id=${encodeURIComponent(userId)}`, { method: 'PUT', body: { role } }),
    remove: (userId) => req(`/team?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE' })
  },
  platform: {
    slug: (slug) => req(`/platform/slug?slug=${encodeURIComponent(slug)}`),
    signup: (body) => req('/platform/signup', { method: 'POST', body }),
    login: (email) => req('/platform/login', { method: 'POST', body: { email } })
  },
  heartbeat: (screenId) =>
    req(`/heartbeat?screen=${encodeURIComponent(screenId)}`, { method: 'POST' }),
  // `target` er en kanal-id, eller { playlist: id } for forhåndsvisning av en spilleliste.
  getState: (target) => req(`/state${viewerQuery(target)}`),
  streamUrl: (target) => `${BASE}/stream${viewerQuery(target)}`
};
