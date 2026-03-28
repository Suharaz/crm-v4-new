import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010/api/v1';

/** Auth API proxy: manages httpOnly cookies for JWT tokens. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string[] }> }) {
  const { action } = await params;
  const actionName = action[0];
  const cookieStore = await cookies();

  if (actionName === 'login') {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });

    // Set httpOnly cookies
    const isProd = process.env.NODE_ENV === 'production';
    cookieStore.set('access_token', data.data.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60, // 15 minutes
    });
    cookieStore.set('refresh_token', data.data.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return NextResponse.json({ data: { message: 'Đăng nhập thành công' } });
  }

  if (actionName === 'refresh') {
    const refreshToken = cookieStore.get('refresh_token')?.value;
    if (!refreshToken) {
      return NextResponse.json({ message: 'Không có refresh token' }, { status: 401 });
    }

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await res.json();
    if (!res.ok) {
      // Clear cookies on refresh failure
      cookieStore.delete('access_token');
      cookieStore.delete('refresh_token');
      return NextResponse.json(data, { status: res.status });
    }

    const isProd = process.env.NODE_ENV === 'production';
    cookieStore.set('access_token', data.data.accessToken, {
      httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: 15 * 60,
    });
    cookieStore.set('refresh_token', data.data.refreshToken, {
      httpOnly: true, secure: isProd, sameSite: 'strict', path: '/api/auth', maxAge: 7 * 24 * 60 * 60,
    });

    return NextResponse.json({ data: { message: 'Token refreshed' } });
  }

  if (actionName === 'logout') {
    const refreshToken = cookieStore.get('refresh_token')?.value;
    if (refreshToken) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }

    cookieStore.delete('access_token');
    cookieStore.delete('refresh_token');
    return NextResponse.json({ data: { message: 'Đăng xuất thành công' } });
  }

  return NextResponse.json({ message: 'Action không hợp lệ' }, { status: 400 });
}
