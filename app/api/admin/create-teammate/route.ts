import { NextRequest, NextResponse } from 'next/server';
import { getUsersFresh, saveUsers, ensureUserColumn, hashPassword } from '@/lib/auth-helpers';
import { isAdminUser } from '@/lib/lane-guard';
import { broadcast } from '@/lib/events';

// POST /api/admin/create-teammate — admin only; creates a human test user + column
export async function POST(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { name } = await req.json();
  const cleanName = String(name ?? '').trim();
  if (cleanName.length < 2) {
    return NextResponse.json({ error: 'Name must be at least 2 characters.' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(cleanName)) {
    return NextResponse.json({ error: 'Name may only contain letters, numbers, spaces, hyphens, underscores and dots.' }, { status: 400 });
  }

  const users = getUsersFresh();
  if (users.some((u: { username: string }) => u.username.toLowerCase() === cleanName.toLowerCase())) {
    return NextResponse.json({ error: 'That name is already taken.' }, { status: 409 });
  }

  const defaultPassword = 'test123';
  const hash = await hashPassword(defaultPassword);

  users.push({
    username: cleanName,
    hash,
    isAgent: false,
    readOnly: false,
    ownColumnOnly: true,
    sessions: [],
  });
  saveUsers(users);

  await ensureUserColumn(cleanName);
  broadcast();

  return NextResponse.json({ ok: true, username: cleanName, password: defaultPassword }, { status: 201 });
}
