import { NextRequest, NextResponse } from 'next/server';
import { getUsersFresh, saveUsers } from '@/lib/auth-helpers';
import { isAdminUser } from '@/lib/lane-guard';
import { prisma } from '@/lib/prisma';

// POST /api/admin/rename-user
// Body: { oldUsername: string, newUsername: string }
// Updates users.json + DB column ownerUsername (and column name if it matched).
export async function POST(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { oldUsername, newUsername } = await req.json().catch(() => ({})) as {
    oldUsername?: string;
    newUsername?: string;
  };

  const oldName = String(oldUsername ?? '').trim();
  const newName = String(newUsername ?? '').trim();

  if (!oldName || !newName) {
    return NextResponse.json({ error: 'oldUsername and newUsername are required.' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(newName) || newName.length < 2 || newName.length > 100) {
    return NextResponse.json({ error: 'Invalid username. Use letters, numbers, spaces, hyphens, underscores or dots (2–100 chars).' }, { status: 400 });
  }

  const users = getUsersFresh();

  const idx = users.findIndex(u => u.username.toLowerCase() === oldName.toLowerCase());
  if (idx === -1) {
    return NextResponse.json({ error: `User "${oldName}" not found.` }, { status: 404 });
  }

  const clash = users.find((u, i) => i !== idx && u.username.toLowerCase() === newName.toLowerCase());
  if (clash) {
    return NextResponse.json({ error: `Username "${newName}" is already taken.` }, { status: 409 });
  }

  // Update users.json
  users[idx].username = newName;
  saveUsers(users);

  // Update DB: ownerUsername on the column, and rename the column itself if it
  // was named after the user (same logic as the CLI rename-user command).
  try {
    const col = await prisma.column.findFirst({ where: { ownerUsername: oldName } });
    if (col) {
      const shouldRenamCol = col.name === oldName;
      await prisma.column.update({
        where: { id: col.id },
        data: {
          ownerUsername: newName,
          ...(shouldRenamCol ? { name: newName } : {}),
        },
      });
    }
  } catch (e) {
    // DB update failed but users.json is already saved — log and continue
    console.error('[rename-user] DB update failed:', e);
  }

  return NextResponse.json({ ok: true, oldUsername: oldName, newUsername: newName });
}
