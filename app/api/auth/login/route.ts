import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies, ensureUserColumn, getUsers } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  const { username, token } = await req.json();

  // ── Multi-user mode (AUTH_USERS_JSON set by server.js) ────────────────────
  const usersJson = process.env.AUTH_USERS_JSON;
  if (usersJson) {
    const users = getUsers();
    const user = users.find(
      u => u.username.toLowerCase() === String(username ?? '').toLowerCase() && u.token === token
    );
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    await ensureUserColumn(user.username);
    const response = NextResponse.json({ ok: true });
    setAuthCookies(response, user.token, user.username);
    return response;
  }

  // ── Legacy single-user mode (AUTH_TOKEN env var) ───────────────────────────
  const validToken = process.env.AUTH_TOKEN;
  const validUsername = process.env.AUTH_USERNAME || '';

  if (validUsername && String(username ?? '').toLowerCase() !== validUsername.toLowerCase()) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  if (!validToken || token !== validToken) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  if (validUsername) await ensureUserColumn(validUsername);

  const response = NextResponse.json({ ok: true });
  setAuthCookies(response, token, validUsername || 'admin');
  return response;
}
