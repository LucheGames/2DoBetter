import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";
import { checkReadOnly, checkOwnColumnOnly } from "@/lib/lane-guard";
import { checkWriteRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tasks = await prisma.task.findMany({
    where: { listId: Number(id) },
    orderBy: [{ completed: "asc" }, { order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(tasks);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authUser = req.headers.get('x-auth-user');

  const roBlock = checkReadOnly(authUser);
  if (roBlock) return roBlock;

  // Rate limit — even cross-column pushes are limited
  if (authUser && !checkWriteRateLimit(authUser)) return rateLimitResponse();

  const { title } = await req.json();
  if (!title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  // Cross-column push is allowed for normal users even on locked columns.
  // Exception: ownColumnOnly tokens may only write to their own column.
  // We do the column lookup lazily — only when the flag is actually set.
  if (authUser) {
    const { getUsersFresh } = await import('@/lib/auth-helpers');
    const user = getUsersFresh().find(u => u.username === authUser);
    if (user?.ownColumnOnly) {
      const list = await prisma.list.findUnique({
        where: { id: Number(id) },
        include: { column: { select: { ownerUsername: true, locked: true } } },
      });
      if (list?.column) {
        const deny = checkOwnColumnOnly(list.column, authUser);
        if (deny) return deny;
      }
    }
  }

  // Reject duplicate title in same list (prevents rapid-fire double-submits)
  const existing = await prisma.task.findFirst({
    where: { listId: Number(id), title: title.trim(), completed: false },
  });
  if (existing) {
    return NextResponse.json(existing); // Return existing instead of creating duplicate
  }

  // Place new task at the end of the active list
  const maxOrder = await prisma.task.aggregate({
    where: { listId: Number(id), completed: false },
    _max: { order: true },
  });
  const task = await prisma.task.create({
    data: {
      listId:    Number(id),
      title:     title.trim(),
      order:     (maxOrder._max.order ?? -1) + 1,
      createdBy: authUser ?? null,   // attribution: who pushed this task here
    },
  });
  broadcast();
  return NextResponse.json(task, { status: 201 });
}
