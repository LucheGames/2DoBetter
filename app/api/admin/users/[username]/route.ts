import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUsersFresh, saveUsers } from '@/lib/auth-helpers';
import { broadcast, broadcastReload } from '@/lib/events';
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
  if (body.supervisorUsername !== undefined) {
    if (body.supervisorUsername === null || body.supervisorUsername === '') {
      delete users[idx].supervisorUsername;
    } else {
      const sup = users.find(u => u.username === body.supervisorUsername);
      if (!sup) return NextResponse.json({ error: 'Supervisor not found' }, { status: 404 });
      users[idx].supervisorUsername = body.supervisorUsername;
    }
  }

  saveUsers(users);
  broadcastReload();
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/users/[username]?deleteData=true — remove user (admin only)
//   deleteData=false (default): orphan their column, rename to "Shared" / "Shared 02" …
//   deleteData=true:            cascade-delete their column + all lists + tasks
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { username } = await params;
  const deleteData = req.nextUrl.searchParams.get('deleteData') === 'true';

  const users = getUsersFresh();
  const idx = users.findIndex(u => u.username === username);
  if (idx === -1) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (users[idx].isAdmin) {
    return NextResponse.json({ error: 'Cannot remove an admin account' }, { status: 403 });
  }

  // Remove from users.json first
  users.splice(idx, 1);
  saveUsers(users);

  // Handle the column
  const column = await prisma.column.findFirst({ where: { ownerUsername: username } });
  if (column) {
    if (deleteData) {
      await prisma.column.delete({ where: { id: column.id } });
      broadcastReload();
    } else {
      // Find next available "Shared" / "Shared 02" name
      const taken = await prisma.column.findMany({
        where: { OR: [{ name: 'Shared' }, { name: { startsWith: 'Shared ' } }] },
        select: { name: true },
      });
      const takenSet = new Set(taken.map(c => c.name));
      let sharedName = 'Shared';
      if (takenSet.has('Shared')) {
        let n = 2;
        while (takenSet.has(`Shared ${String(n).padStart(2, '0')}`)) n++;
        sharedName = `Shared ${String(n).padStart(2, '0')}`;
      }
      await prisma.column.update({
        where: { id: column.id },
        data: { ownerUsername: null, name: sharedName },
      });
      broadcast();
    }
  }

  return NextResponse.json({ ok: true, deletedData: deleteData });
}
