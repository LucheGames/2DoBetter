import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const children = await prisma.list.findMany({
    where: { parentId: Number(id) },
    orderBy: { order: "asc" },
    include: {
      _count: { select: { tasks: { where: { completed: false } } } },
    },
  });
  return NextResponse.json(children);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  // Enforce max nesting depth of 2 (Column > List > Sub-List)
  const parent = await prisma.list.findUnique({
    where: { id: Number(id) },
    select: { parentId: true, columnId: true },
  });
  if (!parent) {
    return NextResponse.json({ error: "Parent list not found" }, { status: 404 });
  }
  if (parent.parentId !== null) {
    return NextResponse.json(
      { error: "Maximum nesting depth reached (2 levels)" },
      { status: 400 }
    );
  }

  // Reject duplicate sub-list name under same parent
  const existing = await prisma.list.findFirst({
    where: { parentId: Number(id), name: name.trim() },
  });
  if (existing) {
    return NextResponse.json(existing);
  }

  const maxOrder = await prisma.list.aggregate({
    where: { parentId: Number(id) },
    _max: { order: true },
  });
  const child = await prisma.list.create({
    data: {
      columnId: parent.columnId,
      parentId: Number(id),
      name: name.trim(),
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
  broadcast();
  return NextResponse.json(child, { status: 201 });
}
