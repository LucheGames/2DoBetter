import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";
import { checkLane, checkReadOnly } from "@/lib/lane-guard";
import { checkWriteRateLimit, rateLimitResponse } from "@/lib/rate-limit";

async function computeBreadcrumb(listId: number): Promise<string> {
  // Single query: fetch the list with its parent chain and column in one go.
  // Prisma doesn't support recursive includes, but the schema only has one
  // level of nesting (parentId), so two levels covers all cases.
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: {
      name: true,
      column: { select: { name: true } },
      parent: { select: { name: true } },
    },
  });
  if (!list) return "";

  const parts: string[] = [];
  if (list.column) parts.push(list.column.name);
  if (list.parent) parts.push(list.parent.name);
  parts.push(list.name);
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

  if (body.title !== undefined) {
    if (body.title.trim().length > 500) {
      return NextResponse.json({ error: "Title too long (max 500 characters)" }, { status: 400 });
    }
    data.title = body.title.trim();
  }
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
