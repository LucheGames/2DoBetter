import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getUsersFresh, saveUsers } from '@/lib/auth-helpers';
import { isAdminUser } from '@/lib/lane-guard';

// POST /api/admin/agent-token — generate (or rotate) an agentToken for a user (admin only)
export async function POST(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { username } = await req.json() as { username?: string };
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });

  const users = getUsersFresh();
  const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (idx === -1) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const token = randomBytes(32).toString('hex'); // 64-char hex, same entropy as session
  users[idx].agentToken = token;
  saveUsers(users);

  return NextResponse.json({ token });
}
