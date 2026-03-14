import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUsersFresh } from '@/lib/auth-helpers';
import { isAdminUser } from '@/lib/lane-guard';

// GET /api/admin/users — list all users with flags + column info (admin only)
export async function GET(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const users = getUsersFresh();
  const columns = await prisma.column.findMany({
    select: { ownerUsername: true, name: true },
  });
  const colMap: Record<string, string> = {};
  for (const c of columns) {
    if (c.ownerUsername) colMap[c.ownerUsername] = c.name;
  }

  return NextResponse.json(
    users.map(u => ({
      username:           u.username,
      isAdmin:            u.isAdmin            ?? false,
      isAgent:            u.isAgent            ?? false,
      readOnly:           u.readOnly           ?? false,
      ownColumnOnly:      u.ownColumnOnly      ?? false,
      columnName:         colMap[u.username]   ?? null,
      supervisorUsername: u.supervisorUsername ?? null,
    }))
  );
}
