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
  return NextResponse.json({ columns });
}
