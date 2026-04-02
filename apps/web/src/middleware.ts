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

/** Auth middleware: redirect unauthenticated users to login. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('access_token')?.value;
  const hasValidToken = token && !isTokenExpired(token);

  // Allow login page — only redirect if token is actually valid
  if (pathname.startsWith('/login')) {
    if (hasValidToken) {
      return NextResponse.redirect(new URL('/', request.url));
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
