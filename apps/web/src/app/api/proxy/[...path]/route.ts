import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010/api/v1';

/**
 * API proxy: forwards client-side requests to NestJS API with auth token from cookie.
 * Solves cross-origin cookie issue (cookie set on :3011, API on :3010).
 */
export async function handler(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const apiPath = '/' + path.join('/');
  const url = new URL(request.url);
  const queryString = url.search;

  const token = request.cookies.get('access_token')?.value;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Forward content-type for non-GET requests
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
  };

  // Forward body for non-GET/HEAD methods
  if (!['GET', 'HEAD'].includes(request.method)) {
    // Handle both JSON and FormData
    if (contentType?.includes('multipart/form-data')) {
      // For file uploads, pass the raw body and remove Content-Type so fetch sets boundary
      delete headers['Content-Type'];
      fetchOptions.body = await request.arrayBuffer();
    } else {
      fetchOptions.body = await request.text();
    }
  }

  try {
    const res = await fetch(`${API_BASE}${apiPath}${queryString}`, fetchOptions);

    // Handle non-JSON responses (CSV downloads, etc.)
    const resContentType = res.headers.get('content-type') || '';
    if (!resContentType.includes('application/json')) {
      const body = await res.arrayBuffer();
      return new NextResponse(body, {
        status: res.status,
        headers: {
          'Content-Type': resContentType,
          ...(res.headers.get('content-disposition') ? { 'Content-Disposition': res.headers.get('content-disposition')! } : {}),
        },
      });
    }

    const data = await res.json();

    // If 401, try refresh token
    if (res.status === 401) {
      const refreshToken = request.cookies.get('refresh_token')?.value;
      if (refreshToken) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          const newToken = refreshData.data.accessToken;

          // Retry original request with new token
          headers['Authorization'] = `Bearer ${newToken}`;
          const retryRes = await fetch(`${API_BASE}${apiPath}${queryString}`, fetchOptions);
          const retryData = await retryRes.json();

          const response = NextResponse.json(retryData, { status: retryRes.status });
          const isProd = process.env.NODE_ENV === 'production';
          response.cookies.set('access_token', newToken, {
            httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: 15 * 60,
          });
          response.cookies.set('refresh_token', refreshData.data.refreshToken, {
            httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60,
          });
          return response;
        }
      }

      // Refresh failed or no refresh token — clear stale cookies
      const errResponse = NextResponse.json(data, { status: 401 });
      errResponse.cookies.set('access_token', '', { path: '/', maxAge: 0 });
      errResponse.cookies.set('refresh_token', '', { path: '/', maxAge: 0 });
      return errResponse;
    }

    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: 'Lỗi kết nối API server' }, { status: 502 });
  }
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
