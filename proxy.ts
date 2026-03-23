import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Next.js 16: proxy always runs on Node.js runtime (no export needed).
// This means we can read disk and share process state with API routes,
// which is exactly what we need for reading users.json without a restart.

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

function readUsers(): Array<{ username: string; hash?: string; token?: string; session?: string; sessions?: string[]; agentToken?: string }> {
  try {
    // Read fresh from disk so newly registered users are visible immediately.
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    // Fallback to the startup env snapshot (e.g. if file doesn't exist yet)
    try { return JSON.parse(process.env.AUTH_USERS_JSON || '[]'); } catch { return []; }
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — no auth required
  // Security: strip any client-supplied x-auth-user to prevent header spoofing
  // on unauthenticated pass-through routes (only the proxy should set this header).
  if (
    pathname === '/login' ||
    pathname.startsWith('/join') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico' ||
    pathname === '/ca.crt'
  ) {
    const headers = new Headers(request.headers);
    headers.delete('x-auth-user');
    return NextResponse.next({ request: { headers } });
  }

  // Accept token from cookie (browser) or Authorization: Bearer header (API/agent clients)
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const tokenCookie = bearerToken ?? request.cookies.get('auth_token')?.value;
  const userCookie = request.cookies.get('auth_user')?.value;

  // ── Multi-user mode ───────────────────────────────────────────────────────
  // Use USERS_FILE on disk (always current) rather than AUTH_USERS_JSON env var
  // (which is a startup snapshot and misses users registered after boot).
  const usersFileExists = fs.existsSync(USERS_FILE);
  if (usersFileExists || process.env.AUTH_USERS_JSON) {
    const users = readUsers();
    // Accept session token (new), legacy plaintext token (migration), or permanent agent token.
    const matchesSession = (u: typeof users[0]) =>
      (tokenCookie != null && u.sessions?.includes(tokenCookie)) ||
      u.session === tokenCookie ||
      u.token === tokenCookie ||
      u.agentToken === tokenCookie;
    const user = userCookie
      ? users.find(u => u.username === userCookie && matchesSession(u))
      : users.find(u => matchesSession(u));
    if (user) {
      // Inject authenticated username for API routes to consume
      const headers = new Headers(request.headers);
      headers.set('x-auth-user', user.username);
      const response = NextResponse.next({ request: { headers } });
      // Prevent browsers and service workers from caching authenticated pages.
      // Without this, a cached board page could be served to unauthenticated users.
      if (!pathname.startsWith('/api/') && !pathname.startsWith('/_next/')) {
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
      return response;
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
    // No auth configured at all — redirect to login (never allow open access)
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized — no auth configured' }, { status: 401 });
    }
    return NextResponse.rewrite(new URL('/login', request.url));
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
