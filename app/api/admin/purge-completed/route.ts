import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminUser } from '@/lib/lane-guard';

// GET /api/admin/purge-completed — return count of completed tasks
export async function GET(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const count = await prisma.task.count({ where: { completed: true } });
  return NextResponse.json({ count });
}

// POST /api/admin/purge-completed — delete completed tasks
// Body: { olderThanDays?: number }  — omit for ALL completed tasks
export async function POST(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { olderThanDays } = await req.json() as { olderThanDays?: number };

  const where =
    olderThanDays && olderThanDays > 0
      ? {
          completed: true,
          updatedAt: { lt: new Date(Date.now() - olderThanDays * 86_400_000) },
        }
      : { completed: true };

  const { count: deleted } = await prisma.task.deleteMany({ where });
  return NextResponse.json({ deleted });
}
