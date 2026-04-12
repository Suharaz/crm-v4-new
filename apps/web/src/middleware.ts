import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Decode JWT payload without verification to check expiry. */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // 30s buffer to avoid edge-case race
    return payload.exp * 1000 < Date.now() - 30_000;
  } catch {
    return true;
  }
}

/** Public routes that don't require authentication. */
const PUBLIC_PATHS = ['/', '/login'];

/** Auth middleware: redirect unauthenticated users to login. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('access_token')?.value;
  const hasValidToken = token && !isTokenExpired(token);

  // Allow public pages
  if (PUBLIC_PATHS.includes(pathname)) {
    // Redirect authenticated users from /login to dashboard
    if (pathname === '/login' && hasValidToken) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // Redirect to login if no valid token
  if (!hasValidToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
