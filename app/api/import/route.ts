import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";
import { isAdminUser } from "@/lib/lane-guard";

// ── Types matching the export format ─────────────────────────────────────────

type TaskInput = {
  title:               string;
  completed?:          boolean;
  completedAt?:        string | null;
  completedBreadcrumb?: string | null;
  order?:              number;
  createdAt?:          string;
};

type ListInput = {
  name:       string;
  order?:     number;
  archivedAt?: string | null;
  tasks?:     TaskInput[];
};

type ColumnInput = {
  name:   string;
  slug:   string;
  order?: number;
  lists?: ListInput[];
};

type ImportPayload = {
  version:  number;
  columns:  ColumnInput[];
};

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Import wipes ALL data — admin only
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json(
      { error: "Only admins can import data (this operation replaces all board data)" },
      { status: 403 }
    );
  }

  let payload: ImportPayload;

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (payload.version !== 1 || !Array.isArray(payload.columns)) {
    return NextResponse.json(
      { error: "Unrecognised export format — expected version 1" },
      { status: 400 }
    );
  }

  let listCount = 0;
  let taskCount = 0;

  // Wrap in a transaction: all-or-nothing, no partial state on error
  await prisma.$transaction(async (tx) => {
    // Cascade delete: columns → lists → tasks (FK onDelete: Cascade in schema)
    await tx.column.deleteMany({});

    for (const col of payload.columns) {
      if (!col.name || !col.slug) continue;

      const column = await tx.column.create({
        data: {
          name:  col.name,
          slug:  col.slug,
          order: col.order ?? 0,
        },
      });

      for (const list of col.lists ?? []) {
        if (!list.name) continue;

        const topList = await tx.list.create({
          data: {
            name:       list.name,
            order:      list.order ?? 0,
            columnId:   column.id,
            archivedAt: list.archivedAt ? new Date(list.archivedAt) : null,
          },
        });
        listCount++;

        for (const task of list.tasks ?? []) {
          if (!task.title) continue;
          await tx.task.create({
            data: {
              title:               task.title,
              completed:           task.completed ?? false,
              completedAt:         task.completedAt   ? new Date(task.completedAt)  : null,
              completedBreadcrumb: task.completedBreadcrumb ?? null,
              order:               task.order   ?? 0,
              listId:              topList.id,
              createdAt:           task.createdAt ? new Date(task.createdAt) : new Date(),
            },
          });
          taskCount++;
        }
      }
    }
  });

  broadcast();

  return NextResponse.json({
    imported: true,
    columns:  payload.columns.length,
    lists:    listCount,
    tasks:    taskCount,
  });
}
