import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminUser } from '@/lib/lane-guard';

// GET /api/admin/purge-graveyard — return count of archived lists
export async function GET(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const count = await prisma.list.count({ where: { archivedAt: { not: null } } });
  return NextResponse.json({ count });
}

// POST /api/admin/purge-graveyard — permanently delete archived lists (+ their tasks/children via cascade)
// Body: { olderThanDays?: number }  — omit for ALL archived lists
export async function POST(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { olderThanDays } = await req.json() as { olderThanDays?: number };

  const where =
    olderThanDays && olderThanDays > 0
      ? {
          archivedAt: { not: null, lt: new Date(Date.now() - olderThanDays * 86_400_000) },
        }
      : { archivedAt: { not: null } };

  const { count: deleted } = await prisma.list.deleteMany({ where });
  return NextResponse.json({ deleted });
}
