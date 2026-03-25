import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";
import { checkReadOnly, checkLane } from "@/lib/lane-guard";
import { checkWriteRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const authUser = req.headers.get('x-auth-user');

  const roBlock = checkReadOnly(authUser);
  if (roBlock) return roBlock;

  if (authUser && !checkWriteRateLimit(authUser)) return rateLimitResponse();

  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    return NextResponse.json({ error: "ids must be a non-empty array of positive integers" }, { status: 400 });
  }

  // Lane guard — verify ALL lists belong to the same column, then check access.
  // This prevents a crafted request from reordering lists in another user's column
  // by including one of their own lists first.
  const lists = await prisma.list.findMany({
    where: { id: { in: ids } },
    select: { id: true, columnId: true, column: true },
  });
  if (lists.length !== ids.length) {
    return NextResponse.json({ error: "One or more list IDs not found" }, { status: 404 });
  }
  const columnIds = new Set(lists.map(l => l.columnId));
  if (columnIds.size !== 1) {
    return NextResponse.json({ error: "All lists must belong to the same column" }, { status: 400 });
  }
  const column = lists[0].column;
  if (column) {
    const deny = checkLane(column, authUser);
    if (deny) return deny;
  }

  await prisma.$transaction(
    ids.map((id: number, index: number) =>
      prisma.list.update({ where: { id }, data: { order: index } })
    )
  );
  broadcast();
  return NextResponse.json({ ok: true });
}
