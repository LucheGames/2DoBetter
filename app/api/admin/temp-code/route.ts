import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getUsersFresh, saveUsers } from '@/lib/auth-helpers';
import { isAdminUser } from '@/lib/lane-guard';

// POST /api/admin/temp-code — generate an 8-digit temporary login code for a user (admin only)
export async function POST(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { username } = await req.json() as { username?: string };
  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  const users = getUsersFresh();
  const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (idx === -1) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Generate 8-digit numeric code from random bytes
  const num = parseInt(randomBytes(4).toString('hex'), 16) >>> 0;
  const code = String(num % 100000000).padStart(8, '0');

  // Expires in 15 minutes
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  users[idx].tempCode = code;
  users[idx].tempCodeExpiry = expiresAt;
  // Invalidate existing sessions — forces re-auth with temp code
  users[idx].sessions = [];
  delete users[idx].session;
  saveUsers(users);

  return NextResponse.json({ code, expiresAt });
}
