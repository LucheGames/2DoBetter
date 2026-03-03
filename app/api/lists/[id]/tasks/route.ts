import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";

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
  const { title } = await req.json();
  if (!title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
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
      listId: Number(id),
      title: title.trim(),
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
  broadcast();
  return NextResponse.json(task, { status: 201 });
}
