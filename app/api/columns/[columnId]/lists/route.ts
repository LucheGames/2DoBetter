import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ columnId: string }> }
) {
  const { columnId } = await params;
  const lists = await prisma.list.findMany({
    where: { columnId: Number(columnId), parentId: null },
    orderBy: { order: "asc" },
    include: {
      _count: { select: { tasks: { where: { completed: false } } } },
      children: {
        orderBy: { order: "asc" },
        include: {
          _count: { select: { tasks: { where: { completed: false } } } },
        },
      },
    },
  });
  return NextResponse.json(lists);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ columnId: string }> }
) {
  const { columnId } = await params;
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  const maxOrder = await prisma.list.aggregate({
    where: { columnId: Number(columnId), parentId: null },
    _max: { order: true },
  });
  const list = await prisma.list.create({
    data: {
      columnId: Number(columnId),
      name: name.trim(),
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
  broadcast();
  return NextResponse.json(list, { status: 201 });
}
