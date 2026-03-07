import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Force Node.js runtime so middleware shares the process with API routes.
// Edge Runtime is a separate V8 isolate — it cannot see in-memory process.env
// mutations made by saveUsers(), so newly registered users would be denied
// until the server restarted. Node.js runtime also lets us read disk directly.
export const runtime = 'nodejs';

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

function readUsers(): Array<{ username: string; token: string }> {
  try {
    // Read fresh from disk so newly registered users are visible immediately.
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    // Fallback to the startup env snapshot (e.g. if file doesn't exist yet)
    try { return JSON.parse(process.env.AUTH_USERS_JSON || '[]'); } catch { return []; }
  }
}

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

  // ── Multi-user mode ───────────────────────────────────────────────────────
  // Use USERS_FILE on disk (always current) rather than AUTH_USERS_JSON env var
  // (which is a startup snapshot and misses users registered after boot).
  const usersFileExists = fs.existsSync(USERS_FILE);
  if (usersFileExists || process.env.AUTH_USERS_JSON) {
    const users = readUsers();
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
