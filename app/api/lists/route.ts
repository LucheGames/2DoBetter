import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";
import { checkReadOnly, checkLane } from "@/lib/lane-guard";
import { checkWriteRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET() {
  const lists = await prisma.list.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { tasks: { where: { completed: false } } } },
      column: { select: { name: true, slug: true } },
    },
  });
  return NextResponse.json(lists);
}

export async function POST(req: Request) {
  const authUser = req.headers.get('x-auth-user');

  const roBlock = checkReadOnly(authUser);
  if (roBlock) return roBlock;

  if (authUser && !checkWriteRateLimit(authUser)) return rateLimitResponse();

  const { name, columnId } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  if (!columnId) {
    return NextResponse.json({ error: "columnId required" }, { status: 400 });
  }

  // Lane guard — check the target column
  const column = await prisma.column.findUnique({ where: { id: Number(columnId) } });
  if (column) {
    const deny = checkLane(column, authUser);
    if (deny) return deny;
  }

  const list = await prisma.list.create({
    data: { name: name.trim(), columnId: Number(columnId) },
  });
  broadcast();
  return NextResponse.json(list, { status: 201 });
}
