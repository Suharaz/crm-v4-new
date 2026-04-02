'use server';

import { cookies } from 'next/headers';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010/api/v1';

/** Get access token from httpOnly cookie (server-side only). */
export async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('access_token')?.value ?? null;
}

/** Server-side fetch with auth token. */
export async function serverFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Lỗi không xác định' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

/** Get current user info (server-side). */
export async function getCurrentUser() {
  try {
    const result = await serverFetch<{ data: any }>('/auth/me');
    return result.data;
  } catch {
    return null;
  }
}
