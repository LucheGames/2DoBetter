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

  // Lane guard — check the column via task → list → column
  const firstTask = await prisma.task.findUnique({
    where: { id: ids[0] },
    include: { list: { include: { column: true } } },
  });
  if (firstTask?.list?.column) {
    const deny = checkLane(firstTask.list.column, authUser);
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
