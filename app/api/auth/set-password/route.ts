import { NextRequest, NextResponse } from 'next/server';
import {
  getUsersFresh, saveUsers,
  hashPassword, generateSession,
  setAuthCookies, ensureUserColumn,
} from '@/lib/auth-helpers';

// POST /api/auth/set-password — set a new password using a resetToken
// Issued after verify-temp-code. Logs the user in on success.
export async function POST(req: NextRequest) {
  const { resetToken, newPassword } = await req.json() as { resetToken?: string; newPassword?: string };
  if (!resetToken || !newPassword || newPassword.length < 8) {
    return NextResponse.json(
      { error: 'resetToken and newPassword (min 8 chars) required' },
      { status: 400 },
    );
  }

  const users = getUsersFresh();
  const idx = users.findIndex(u => u.resetToken === resetToken);
  if (idx === -1) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const user = users[idx];
  if (!user.resetTokenExpiry || new Date(user.resetTokenExpiry) < new Date()) {
    return NextResponse.json({ error: 'Token expired — start over.' }, { status: 401 });
  }

  // Set new password
  users[idx].hash = await hashPassword(newPassword);
  // Clear reset artifacts
  delete users[idx].tempCode;
  delete users[idx].tempCodeExpiry;
  delete users[idx].resetToken;
  delete users[idx].resetTokenExpiry;
  // Wipe old sessions
  users[idx].sessions = [];
  delete users[idx].session;

  // Issue a fresh session and log them in
  const session = generateSession();
  users[idx].sessions = [session];
  saveUsers(users);

  await ensureUserColumn(user.username);
  const response = NextResponse.json({ ok: true });
  setAuthCookies(response, session, user.username);
  return response;
}
