import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
    data.name = body.name.trim();
  }
  if (body.columnId !== undefined) data.columnId = body.columnId;

  const list = await prisma.list.update({
    where: { id: Number(id) },
    data,
  });
  return NextResponse.json(list);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const list = await prisma.list.findUnique({ where: { id: Number(id) } });
  if (!list) return new NextResponse(null, { status: 404 });

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
  return new NextResponse(null, { status: 204 });
}
