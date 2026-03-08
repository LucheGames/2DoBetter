import { NextRequest, NextResponse } from 'next/server';
import { getUsersFresh, saveUsers } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;

  // Invalidate the server-side session so the token can't be reused
  if (token) {
    const users = getUsersFresh();
    const idx = users.findIndex(u => u.session === token);
    if (idx !== -1) {
      delete users[idx].session;
      saveUsers(users);
    }
  }

  const response = NextResponse.json({ ok: true });
  const clear = { httpOnly: true, path: '/', maxAge: 0, expires: new Date(0) };
  response.cookies.set('auth_token', '', clear);
  response.cookies.set('auth_user', '', { ...clear, httpOnly: false });
  return response;
}
