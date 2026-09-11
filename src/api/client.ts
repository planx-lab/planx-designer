import { ApiError } from '@/types/api';
import { parseJson, stringifyJson } from '@/lib/json';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'Unknown error');
    throw new ApiError(res.status, body);
  }

  // 204 No Content (e.g. DELETE) has no body — don't attempt to parse JSON.
  if (res.status === 204) {
    return undefined as T;
  }

  return parseJson(await res.text()) as T;
}

export const api = {
  get: request,
  post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>(path, { method: 'POST', body: stringifyJson(body), ...(signal ? { signal } : {}) });
  },
  /** POST with no body — e.g. run an already-stored pipeline by id. */
  postEmpty<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'POST' });
  },
  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'PUT', body: stringifyJson(body) });
  },
  del<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },
};
