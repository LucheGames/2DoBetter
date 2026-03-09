import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";
import { checkLane, checkReadOnly } from "@/lib/lane-guard";
import { checkWriteRateLimit, rateLimitResponse } from "@/lib/rate-limit";

async function computeBreadcrumb(listId: number): Promise<string> {
  const parts: string[] = [];

  let currentList = await prisma.list.findUnique({
    where: { id: listId },
    select: { name: true, parentId: true, columnId: true },
  });

  while (currentList) {
    parts.unshift(currentList.name);
    if (currentList.parentId) {
      currentList = await prisma.list.findUnique({
        where: { id: currentList.parentId },
        select: { name: true, parentId: true, columnId: true },
      });
    } else {
      const column = await prisma.column.findUnique({
        where: { id: currentList.columnId },
        select: { name: true },
      });
      if (column) parts.unshift(column.name);
      break;
    }
  }

  return parts.join(" > ");
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authUser = req.headers.get('x-auth-user');

  const roBlock = checkReadOnly(authUser);
  if (roBlock) return roBlock;

  // Rate limit per user
  if (authUser && !checkWriteRateLimit(authUser)) return rateLimitResponse();

  const body = await req.json();
  const data: Record<string, unknown> = {};

  // Lane guard — completing/uncompleting a task is always allowed (cross-column ack).
  // Renaming, moving, or reordering requires column ownership when locked.
  const isCompletionOnly = Object.keys(body).every(k =>
    ['completed', 'completedAt'].includes(k)
  );
  if (!isCompletionOnly) {
    const existing = await prisma.task.findUnique({
      where: { id: Number(id) },
      include: { list: { include: { column: true } } },
    });
    if (existing?.list?.column) {
      const deny = checkLane(existing.list.column, authUser);
      if (deny) return deny;
    }
  }

  if (body.title !== undefined) data.title = body.title.trim();
  if (body.order !== undefined) data.order = body.order;
  if (body.listId !== undefined) data.listId = body.listId;

  if (body.completed !== undefined) {
    data.completed = body.completed;
    data.completedAt = body.completed ? new Date() : null;

    if (body.completed) {
      // Completing a task: record where it came from
      const task = await prisma.task.findUnique({
        where: { id: Number(id) },
        select: { listId: true },
      });
      if (task) {
        data.completedBreadcrumb = await computeBreadcrumb(task.listId);
      }
    } else {
      // Un-completing a task: if the parent project is archived, resurrect it
      const task = await prisma.task.findUnique({
        where: { id: Number(id) },
        select: { listId: true },
      });
      if (task) {
        // Walk up to find the top-level list
        let list = await prisma.list.findUnique({
          where: { id: task.listId },
          select: { id: true, parentId: true, archivedAt: true },
        });
        // If this is a sub-list task, find the top-level parent
        if (list?.parentId) {
          list = await prisma.list.findUnique({
            where: { id: list.parentId },
            select: { id: true, parentId: true, archivedAt: true },
          });
        }
        if (list?.archivedAt) {
          await prisma.list.update({
            where: { id: list.id },
            data: { archivedAt: null },
          });
        }
      }
    }
  }

  const task = await prisma.task.update({
    where: { id: Number(id) },
    data,
  });
  broadcast();
  return NextResponse.json(task);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authUser = req.headers.get('x-auth-user');

  const roBlock = checkReadOnly(authUser);
  if (roBlock) return roBlock;

  if (authUser && !checkWriteRateLimit(authUser)) return rateLimitResponse();

  // Lane guard
  const existing = await prisma.task.findUnique({
    where: { id: Number(id) },
    include: { list: { include: { column: true } } },
  });
  if (existing?.list?.column) {
    const deny = checkLane(existing.list.column, authUser);
    if (deny) return deny;
  }

  await prisma.task.delete({ where: { id: Number(id) } });
  broadcast();
  return new NextResponse(null, { status: 204 });
}
