import { NextRequest, NextResponse, after } from 'next/server';
import { getUsersFresh, saveUsers } from '@/lib/auth-helpers';

function clearSession(token: string | undefined) {
  if (!token) return;
  const users = getUsersFresh();
  const idx = users.findIndex(
    u => u.session === token || u.sessions?.includes(token)
  );
  if (idx !== -1) {
    // Remove only this device's session — other devices stay logged in
    delete users[idx].session;
    if (users[idx].sessions) {
      users[idx].sessions = users[idx].sessions!.filter(s => s !== token);
    }
    saveUsers(users);
  }
}

function applyClearCookies(response: NextResponse) {
  const clear = { httpOnly: true, path: '/', maxAge: 0, expires: new Date(0) };
  response.cookies.set('auth_token', '', clear);
  response.cookies.set('auth_user', '', { ...clear, httpOnly: false });
}

/** GET /api/auth/logout — browser navigation logout (instant UX).
 *  Clears cookies and redirects immediately; invalidates the server-side
 *  session token after the response has been sent via after().
 *
 *  Uses Host header + x-forwarded-proto (set by server.js for HTTPS) to
 *  build the redirect URL — req.url base is localhost internally in the
 *  custom server and would redirect phones to an unreachable address. */
export async function GET(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  const host  = req.headers.get('host') ?? 'localhost:3000';
  const rawProto = req.headers.get('x-forwarded-proto') ?? 'http';
  const proto = (rawProto === 'https' || rawProto === 'http') ? rawProto : 'https';
  const response = NextResponse.redirect(`${proto}://${host}/login`);
  applyClearCookies(response);
  after(() => clearSession(token));
  return response;
}

/** POST /api/auth/logout — used by the client-side sign-out handler. */
export async function POST(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  const response = NextResponse.json({ ok: true });
  applyClearCookies(response);
  after(() => clearSession(token));
  return response;
}
