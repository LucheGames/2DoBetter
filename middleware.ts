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

  const tokenCookie = request.cookies.get('auth_token')?.value;
  const userCookie = request.cookies.get('auth_user')?.value;

  // ── Multi-user mode (AUTH_USERS_JSON) ────────────────────────────────────
  const usersJson = process.env.AUTH_USERS_JSON;
  if (usersJson) {
    try {
      const users: Array<{ username: string; token: string }> = JSON.parse(usersJson);
      // Match on both username + token to handle duplicate passwords correctly
      const user = userCookie
        ? users.find(u => u.username === userCookie && u.token === tokenCookie)
        : users.find(u => u.token === tokenCookie);
      if (user) {
        // Inject authenticated username for API routes to consume
        const headers = new Headers(request.headers);
        headers.set('x-auth-user', user.username);
        return NextResponse.next({ request: { headers } });
      }
    } catch {
      // Malformed users JSON — fall through to 401
    }

    // Token not found in users list
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.rewrite(new URL('/login', request.url));
  }

  // ── Legacy single-user mode (AUTH_TOKEN env var) ─────────────────────────
  const validToken = process.env.AUTH_TOKEN;
  if (!validToken) {
    // No auth configured — dev mode, allow everything
    return NextResponse.next();
  }

  if (tokenCookie === validToken) {
    // Inject username (may be empty string in legacy installs)
    const username = process.env.AUTH_USERNAME || '';
    if (username) {
      const headers = new Headers(request.headers);
      headers.set('x-auth-user', username);
      return NextResponse.next({ request: { headers } });
    }
    return NextResponse.next();
  }

  // Invalid token
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Rewrite to login page (not redirect — redirects break PWA standalone launch)
  return NextResponse.rewrite(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
