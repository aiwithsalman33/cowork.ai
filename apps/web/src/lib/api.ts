'use client';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function csrfToken(): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|;\s*)pa_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : '';
}

type Refresh = 'ok' | 'expired' | 'unreachable';
let refreshing: Promise<Refresh> | null = null;

/** Refreshes once at a time, also across tabs: refresh tokens are single-use. */
async function refreshSession(csrfBefore: string): Promise<Refresh> {
  const run = async (): Promise<Refresh> => {
    // another tab already refreshed while this one was waiting
    if (csrfToken() && csrfToken() !== csrfBefore) return 'ok';
    try {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': csrfToken() },
      });
      return r.ok ? 'ok' : r.status === 401 || r.status === 403 ? 'expired' : 'unreachable';
    } catch {
      return 'unreachable';
    }
  };
  refreshing ??= Promise.resolve(
    navigator.locks ? navigator.locks.request('pa_refresh', run) : run(),
  ).finally(() => {
    setTimeout(() => (refreshing = null), 0);
  });
  return refreshing;
}

const NO_REFRESH = ['/auth/login', '/auth/signup', '/auth/logout', '/auth/refresh'];

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const doFetch = () =>
    fetch(`/api${path}`, {
      ...rest,
      credentials: 'same-origin',
      headers: {
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        'x-csrf-token': csrfToken(),
        ...(rest.headers ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });

  const csrfBefore = csrfToken();
  let res = await doFetch();
  if (res.status === 401 && !NO_REFRESH.some((p) => path.startsWith(p))) {
    const refreshed = await refreshSession(csrfBefore);
    if (refreshed === 'ok') res = await doFetch();
    else if (refreshed === 'unreachable') throw new ApiError(503, 'Server is not reachable. Try again.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // an HTML error page from the proxy (e.g. while a new version is being deployed)
    throw new ApiError(res.ok ? 502 : res.status, 'Server is restarting. Try again in a moment.');
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error ?? `Request failed (${res.status})`,
      data?.code,
      data?.details,
    );
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} });
export const put = <T>(path: string, json?: unknown) => api<T>(path, { method: 'PUT', json: json ?? {} });
export const patch = <T>(path: string, json?: unknown) => api<T>(path, { method: 'PATCH', json: json ?? {} });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });
