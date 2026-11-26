'use client';

import { useEffect, useState } from 'react';

export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  json: Record<string, unknown> & { total?: number; totalPages?: number; code?: string };
}

/** fetch wrapper: JSON in/out, redirects to /login on 401, never throws. */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return { ok: false, status: 401, error: 'Unauthorized', json: {} };
    }
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && json.success !== false, status: res.status, data: json.data as T, error: json.error, json };
  } catch {
    return { ok: false, status: 0, error: 'Network error — is the server running?', json: {} };
  }
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function formatDateTime(v?: string | Date | null) {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(v?: string | Date | null) {
  if (!v) return '—';
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatDuration(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}
