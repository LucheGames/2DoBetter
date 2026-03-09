import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";
import { checkLane, checkReadOnly } from "@/lib/lane-guard";
import { checkWriteRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authUser = req.headers.get('x-auth-user');

  const roBlock = checkReadOnly(authUser);
  if (roBlock) return roBlock;

  if (authUser && !checkWriteRateLimit(authUser)) return rateLimitResponse();

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
    data.name = body.name.trim();
  }
  if (body.columnId !== undefined) data.columnId = body.columnId;

  // Lane guard — check the list's current column
  const existing = await prisma.list.findUnique({
    where: { id: Number(id) },
    include: { column: true },
  });
  if (existing?.column) {
    const deny = checkLane(existing.column, authUser);
    if (deny) return deny;
  }

  const list = await prisma.list.update({
    where: { id: Number(id) },
    data,
  });
  broadcast();
  return NextResponse.json(list);
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

  const list = await prisma.list.findUnique({
    where: { id: Number(id) },
    include: { column: true },
  });
  if (!list) return new NextResponse(null, { status: 404 });

  // Lane guard
  if (list.column) {
    const deny = checkLane(list.column, authUser);
    if (deny) return deny;
  }

  // Top-level projects are soft-archived (sent to graveyard).
  // Sub-lists are hard-deleted (they have a parent, less critical).
  if (list.parentId === null) {
    await prisma.list.update({
      where: { id: Number(id) },
      data: { archivedAt: new Date() },
    });
  } else {
    await prisma.list.delete({ where: { id: Number(id) } });
  }
  broadcast();
  return new NextResponse(null, { status: 204 });
}
