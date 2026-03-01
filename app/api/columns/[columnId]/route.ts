import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ columnId: string }> }
) {
  const { columnId } = await params;
  const id = parseInt(columnId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid column ID" }, { status: 400 });
  }

  // Prevent deleting the principal column (order 0)
  const column = await prisma.column.findUnique({ where: { id } });
  if (!column) {
    return NextResponse.json({ error: "Column not found" }, { status: 404 });
  }
  if (column.order === 0) {
    return NextResponse.json(
      { error: "Cannot delete the principal column" },
      { status: 403 }
    );
  }

  await prisma.column.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
