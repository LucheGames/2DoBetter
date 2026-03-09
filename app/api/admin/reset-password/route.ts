import { NextRequest, NextResponse } from 'next/server';
import { getUsersFresh, saveUsers, hashPassword } from '@/lib/auth-helpers';
import { isAdminUser } from '@/lib/lane-guard';

// POST /api/admin/reset-password — set a new password for any user (admin only)
export async function POST(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { username, newPassword } = await req.json() as { username?: string; newPassword?: string };
  if (!username || !newPassword || newPassword.length < 6) {
    return NextResponse.json({ error: 'username and newPassword (min 6 chars) required' }, { status: 400 });
  }

  const users = getUsersFresh();
  const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (idx === -1) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  users[idx].hash = await hashPassword(newPassword);
  // Invalidate existing session so they must log in with the new password
  users[idx].session = '';
  saveUsers(users);

  return NextResponse.json({ ok: true });
}
