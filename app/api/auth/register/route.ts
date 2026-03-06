import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies, ensureUserColumn, getUsers, saveUsers } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  // Registration requires an invite code set by the admin (INVITE_CODE env var)
  const validInviteCode = process.env.INVITE_CODE;
  if (!validInviteCode) {
    return NextResponse.json({ error: 'Registration is not enabled on this server.' }, { status: 403 });
  }

  const { username, token, inviteCode } = await req.json();

  if (inviteCode !== validInviteCode) {
    return NextResponse.json({ error: 'Invalid invite code.' }, { status: 401 });
  }

  const cleanUsername = String(username ?? '').trim();
  if (cleanUsername.length < 2) {
    return NextResponse.json({ error: 'Username must be at least 2 characters.' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(cleanUsername)) {
    return NextResponse.json({ error: 'Username may only contain letters, numbers, spaces, hyphens, underscores and dots.' }, { status: 400 });
  }
  if (!token || String(token).length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const users = getUsers();

  if (users.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
    return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
  }

  // Add user, persist to disk, and update the live process (no restart needed)
  users.push({ username: cleanUsername, token: String(token) });
  try {
    saveUsers(users);
  } catch {
    return NextResponse.json({ error: 'Could not save user — check server permissions.' }, { status: 500 });
  }

  // Provision a column for the new user
  await ensureUserColumn(cleanUsername);

  // Log them straight in
  const response = NextResponse.json({ ok: true });
  setAuthCookies(response, String(token), cleanUsername);
  return response;
}
