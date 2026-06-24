/**
 * Browser requests go through the Next.js /api rewrite (same origin, no CORS).
 * Server components talk to Express directly.
 */
export function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
}

const TOKEN_KEY = 'auth_token';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(extra = {}) {
  const token = getToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  if (res.status === 401 && typeof window !== 'undefined') {
    setToken(null);
    window.location.href = '/login';
  }
  return res;
}

export async function fetchJobs() {
  try {
    const res = await apiFetch('/jobs', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || [];
  } catch {
    return [];
  }
}

export async function fetchJob(jobId) {
  try {
    const res = await apiFetch(`/jobs/${jobId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.job || null;
  } catch {
    return null;
  }
}

export async function loginRequest(username, password) {
  const res = await fetch(`${getApiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function fetchMe() {
  const res = await apiFetch('/auth/me');
  if (!res.ok) return null;
  const data = await res.json();
  return data.user || null;
}

export async function fetchUsers() {
  try {
    const res = await apiFetch('/users', { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function createUserRequest(userData) {
  const res = await apiFetch('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create user');
  return data;
}

export async function updateUserRequest(userId, userData) {
  const res = await apiFetch(`/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update user');
  return data;
}

export async function deleteUserRequest(userId) {
  const res = await apiFetch(`/users/${userId}`, {
    method: 'DELETE',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete user');
  return data;
}
