import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsersFresh } from "@/lib/auth-helpers";

export async function GET(req: NextRequest) {
  // x-auth-user is injected by middleware after successful token validation
  const currentUser = req.headers.get("x-auth-user") || null;

  const users = getUsersFresh();
  const currentUserRecord = currentUser ? users.find(u => u.username === currentUser) : null;

  const isAdmin = currentUserRecord?.isAdmin === true;
  const isAgent = currentUserRecord?.isAgent === true;

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
        },
      },
    },
  });

  // Attach isAgent + supervisorUsername from users.json per column
  const enriched = columns.map(col => {
    if (!col.ownerUsername) {
      // Legacy unowned column (e.g. original Claude column) — treat as agent
      return { ...col, isAgent: true };
    }
    const owner = users.find(u => u.username === col.ownerUsername);
    if (owner?.isAgent) {
      return {
        ...col,
        isAgent: true,
        supervisorUsername: owner.supervisorUsername,
      };
    }
    return col;
  });

  return NextResponse.json({ columns: enriched, currentUser, isAdmin, isAgent });
}
