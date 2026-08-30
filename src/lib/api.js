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
    throw new Error(data?.error || `${res.status} ${res.statusText}`);
  }
  return data;
}

const crud = (resource) => ({
  list: (query = '') => req(`/${resource}${query}`),
  create: (body) => req(`/${resource}`, { method: 'POST', body }),
  update: (id, body) => req(`/${resource}?id=${encodeURIComponent(id)}`, { method: 'PUT', body }),
  remove: (id) => req(`/${resource}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
});

export const api = {
  screens: crud('screens'),
  schedule: crud('schedule'),
  sponsors: crud('sponsors'),
  alerts: {
    list: (all = false) => req(`/alerts${all ? '?all=1' : ''}`),
    create: (body) => req('/alerts', { method: 'POST', body }),
    dismiss: (id) => req(`/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    dismissAll: () => req('/alerts?all=1', { method: 'DELETE' })
  },
  getState: (screenId) =>
    req(`/state${screenId ? `?screen=${encodeURIComponent(screenId)}` : ''}`),
  streamUrl: (screenId) =>
    `${BASE}/stream${screenId ? `?screen=${encodeURIComponent(screenId)}` : ''}`
};
