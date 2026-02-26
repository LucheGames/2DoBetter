import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const lists = await prisma.list.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { tasks: { where: { completed: false } } } } },
  });
  return NextResponse.json(lists);
}

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  const list = await prisma.list.create({ data: { name: name.trim() } });
  return NextResponse.json(list, { status: 201 });
}
