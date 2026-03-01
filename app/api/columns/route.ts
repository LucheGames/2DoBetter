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

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  // Generate a URL-safe slug from the name
  const baseSlug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  // Handle slug collisions by appending a counter
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.column.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  // Place the new column after all existing ones
  const agg = await prisma.column.aggregate({ _max: { order: true } });
  const order = (agg._max.order ?? -1) + 1;

  const column = await prisma.column.create({
    data: {
      name: name.trim(),
      slug,
      order,
      lists: {
        create: [{ name: "Tasks", order: 0 }],
      },
    },
    include: { lists: true },
  });

  return NextResponse.json(column, { status: 201 });
}
