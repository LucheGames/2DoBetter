import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  // Export everything — including archived lists and completed tasks
  const columns = await prisma.column.findMany({
    orderBy: { order: "asc" },
    include: {
      lists: {
        where:   { parentId: null },
        orderBy: { order: "asc" },
        include: {
          tasks: {
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });

  const payload = {
    version:    1,
    exportedAt: new Date().toISOString(),
    app:        "2Do Better",
    columns: columns.map(col => ({
      name:  col.name,
      slug:  col.slug,
      order: col.order,
      lists: col.lists.map(list => ({
        name:       list.name,
        order:      list.order,
        archivedAt: list.archivedAt,
        tasks: list.tasks.map(t => ({
          title:               t.title,
          completed:           t.completed,
          completedAt:         t.completedAt,
          completedBreadcrumb: t.completedBreadcrumb,
          order:               t.order,
          createdAt:           t.createdAt,
        })),
      })),
    })),
  };

  const date = new Date().toISOString().split("T")[0];
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type":        "application/json",
      "Content-Disposition": `attachment; filename="2dobetter-${date}.json"`,
    },
  });
}
