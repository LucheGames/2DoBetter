import { NextRequest, NextResponse } from 'next/server';
import { getUsersFresh, saveUsers } from '@/lib/auth-helpers';
import { isAdminUser } from '@/lib/lane-guard';

// PATCH /api/admin/users/[username] — update access flags (admin only)
// Body: { readOnly?: boolean, ownColumnOnly?: boolean, isAgent?: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { username } = await params;
  const body = await req.json();

  const users = getUsersFresh();
  const idx = users.findIndex(u => u.username === username);
  if (idx === -1) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  // Protect admin accounts from flag changes via the API
  if (users[idx].isAdmin) {
    return NextResponse.json({ error: 'Cannot modify flags on an admin account' }, { status: 403 });
  }

  if (body.readOnly      !== undefined) users[idx].readOnly      = Boolean(body.readOnly);
  if (body.ownColumnOnly !== undefined) users[idx].ownColumnOnly = Boolean(body.ownColumnOnly);
  if (body.isAgent       !== undefined) users[idx].isAgent       = Boolean(body.isAgent);

  saveUsers(users);
  return NextResponse.json({ ok: true });
}
