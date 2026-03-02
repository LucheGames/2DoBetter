import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/graveyard?columnId=1 — return soft-archived top-level lists for a column */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const columnId = searchParams.get("columnId");

  const archived = await prisma.list.findMany({
    where: {
      parentId: null,
      archivedAt: { not: null },
      ...(columnId ? { columnId: Number(columnId) } : {}),
    },
    orderBy: { archivedAt: "desc" },
    include: {
      tasks: {
        orderBy: [{ completed: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      },
      children: {
        orderBy: { order: "asc" },
        include: {
          tasks: {
            orderBy: [{ completed: "asc" }, { order: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
  return NextResponse.json({ archived });
}
