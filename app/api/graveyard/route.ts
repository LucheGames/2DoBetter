import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsersFresh } from "@/lib/auth-helpers";
import { isAdminUser } from "@/lib/lane-guard";

/** GET /api/graveyard?columnId=1 — return soft-archived top-level lists.
 *  ownColumnOnly users are restricted to their own column's graveyard. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const columnId = searchParams.get("columnId");
  const authUser = req.headers.get("x-auth-user");

  // Determine column filter — ownColumnOnly users can only see their own graveyard
  let columnFilter: { columnId?: number } = {};
  if (columnId) {
    columnFilter = { columnId: Number(columnId) };
  } else if (authUser && !isAdminUser(authUser)) {
    const user = getUsersFresh().find(u => u.username === authUser);
    if (user?.ownColumnOnly) {
      // Restrict to the user's own column
      const ownCol = await prisma.column.findFirst({ where: { ownerUsername: authUser } });
      if (ownCol) columnFilter = { columnId: ownCol.id };
    }
  }

  const archived = await prisma.list.findMany({
    where: {
      parentId: null,
      archivedAt: { not: null },
      ...columnFilter,
    },
    orderBy: { archivedAt: "desc" },
    include: {
      tasks: {
        orderBy: [{ completed: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  return NextResponse.json({ archived });
}
