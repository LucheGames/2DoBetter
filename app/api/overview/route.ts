import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  // x-auth-user is injected by middleware after successful token validation
  const currentUser = req.headers.get("x-auth-user") || null;

  const columns = await prisma.column.findMany({
    orderBy: { order: "asc" },
    include: {
      lists: {
        where: { parentId: null, archivedAt: null },
        orderBy: { order: "asc" },
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
      },
    },
  });

  return NextResponse.json({ columns, currentUser });
}
