import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const columns = await prisma.column.findMany({
    orderBy: { order: "asc" },
    include: {
      lists: {
        where: { parentId: null },
        orderBy: { order: "asc" },
        include: {
          _count: { select: { tasks: { where: { completed: false } } } },
        },
      },
    },
  });
  return NextResponse.json(columns);
}
