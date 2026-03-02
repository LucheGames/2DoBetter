import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** POST /api/graveyard/[id]/resurrect — restore an archived project to the active board */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const list = await prisma.list.findUnique({ where: { id: Number(id) } });
  if (!list || list.archivedAt === null) {
    return NextResponse.json({ error: "Not found in graveyard" }, { status: 404 });
  }
  await prisma.list.update({
    where: { id: Number(id) },
    data: { archivedAt: null },
  });
  return NextResponse.json({ ok: true });
}
