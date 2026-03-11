import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";
import { checkReadOnly, checkLane } from "@/lib/lane-guard";
import { checkWriteRateLimit, rateLimitResponse } from "@/lib/rate-limit";

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
    },
  });
  return NextResponse.json(lists);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ columnId: string }> }
) {
  const { columnId } = await params;
  const authUser = req.headers.get('x-auth-user');

  const roBlock = checkReadOnly(authUser);
  if (roBlock) return roBlock;

  if (authUser && !checkWriteRateLimit(authUser)) return rateLimitResponse();

  // Lane guard — check the target column
  const column = await prisma.column.findUnique({ where: { id: Number(columnId) } });
  if (!column) return NextResponse.json({ error: "Column not found" }, { status: 404 });
  const deny = checkLane(column, authUser);
  if (deny) return deny;

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
