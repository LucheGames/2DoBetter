import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";
import { checkLane, checkReadOnly } from "@/lib/lane-guard";
import { checkWriteRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/** POST /api/graveyard/[id]/resurrect — restore an archived project to the active board */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authUser = req.headers.get('x-auth-user');

  const roBlock = checkReadOnly(authUser);
  if (roBlock) return roBlock;

  if (authUser && !checkWriteRateLimit(authUser)) return rateLimitResponse();

  const list = await prisma.list.findUnique({
    where: { id: Number(id) },
    include: { column: true },
  });
  if (!list || list.archivedAt === null) {
    return NextResponse.json({ error: "Not found in graveyard" }, { status: 404 });
  }

  // Lane guard — only the column owner or admin can restore their lists
  if (list.column) {
    const deny = checkLane(list.column, authUser);
    if (deny) return deny;
  }

  await prisma.list.update({
    where: { id: Number(id) },
    data: { archivedAt: null },
  });
  broadcast();
  return NextResponse.json({ ok: true });
}
