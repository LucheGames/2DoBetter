import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — no auth required
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico' ||
    pathname === '/ca.crt'
  ) {
    return NextResponse.next();
  }

  // If no AUTH_TOKEN configured, auth is disabled (dev mode)
  const validToken = process.env.AUTH_TOKEN;
  if (!validToken) {
    return NextResponse.next();
  }

  // Check auth cookie
  const token = request.cookies.get('auth_token')?.value;
  if (token === validToken) {
    return NextResponse.next();
  }

  // API routes return 401 instead of redirect
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rewrite to login page (not redirect — redirects break PWA standalone launch)
  const loginUrl = new URL('/login', request.url);
  return NextResponse.rewrite(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
