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

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-csrf-token': csrfToken() },
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

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

  let res = await doFetch();
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await doFetch();
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
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
