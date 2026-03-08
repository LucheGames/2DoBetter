import { NextRequest, NextResponse } from 'next/server';
import { getUsersFresh, saveUsers } from '@/lib/auth-helpers';

function clearSession(token: string | undefined) {
  if (!token) return;
  const users = getUsersFresh();
  const idx = users.findIndex(u => u.session === token);
  if (idx !== -1) {
    delete users[idx].session;
    saveUsers(users);
  }
}

function applyClearCookies(response: NextResponse) {
  const clear = { httpOnly: true, path: '/', maxAge: 0, expires: new Date(0) };
  response.cookies.set('auth_token', '', clear);
  response.cookies.set('auth_user', '', { ...clear, httpOnly: false });
}

/** GET /api/auth/logout — browser navigation logout (instant UX).
 *  Clears the session then issues a server-side redirect to /login.
 *  No JS await needed on the client — just set window.location.href. */
export async function GET(req: NextRequest) {
  clearSession(req.cookies.get('auth_token')?.value);
  const response = NextResponse.redirect(new URL('/login', req.url));
  applyClearCookies(response);
  return response;
}

/** POST /api/auth/logout — kept for API compatibility. */
export async function POST(req: NextRequest) {
  clearSession(req.cookies.get('auth_token')?.value);
  const response = NextResponse.json({ ok: true });
  applyClearCookies(response);
  return response;
}
