import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";
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

  // Rate limit — even cross-column pushes are limited
  if (authUser && !checkWriteRateLimit(authUser)) return rateLimitResponse();

  const { title } = await req.json();
  if (!title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  // Note: creating a task is intentionally NOT lane-guarded.
  // Any user can push a task to any column regardless of lock status.
  // The column owner can always delete unwanted pushed tasks.

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
