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

  // Lane guard — verify ALL tasks belong to the same column, then check access.
  // This prevents a crafted request from reordering tasks in another user's column
  // by including one of their own tasks first.
  const tasks = await prisma.task.findMany({
    where: { id: { in: ids } },
    select: { id: true, list: { select: { columnId: true, column: true } } },
  });
  if (tasks.length !== ids.length) {
    return NextResponse.json({ error: "One or more task IDs not found" }, { status: 404 });
  }
  const columnIds = new Set(tasks.map(t => t.list.columnId));
  if (columnIds.size !== 1) {
    return NextResponse.json({ error: "All tasks must belong to the same column" }, { status: 400 });
  }
  const column = tasks[0].list.column;
  if (column) {
    const deny = checkLane(column, authUser);
    if (deny) return deny;
  }

  await Promise.all(
    ids.map((id: number, index: number) =>
      prisma.task.update({ where: { id }, data: { order: index } })
    )
  );
  broadcast();
  return NextResponse.json({ ok: true });
}
