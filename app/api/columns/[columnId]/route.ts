import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast, broadcastReload } from "@/lib/events";
import { isAdminUser, checkReadOnly } from "@/lib/lane-guard";
import { checkWriteRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ columnId: string }> }
) {
  const { columnId } = await params;
  const id = parseInt(columnId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid column ID" }, { status: 400 });
  }

  const authUser = req.headers.get('x-auth-user');
  const roBlock = checkReadOnly(authUser);
  if (roBlock) return roBlock;

  if (authUser && !checkWriteRateLimit(authUser)) return rateLimitResponse();

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

  // Only column owner or admin can delete a column
  if (authUser && column.ownerUsername !== authUser && !isAdminUser(authUser)) {
    return NextResponse.json(
      { error: "Only the column owner or an admin can delete this column" },
      { status: 403 }
    );
  }

  await prisma.column.delete({ where: { id } });
  broadcastReload();
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ columnId: string }> }
) {
  const { columnId } = await params;
  const id = parseInt(columnId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid column ID" }, { status: 400 });
  }

  const authUser = req.headers.get('x-auth-user');
  const roBlock = checkReadOnly(authUser);
  if (roBlock) return roBlock;

  if (authUser && !checkWriteRateLimit(authUser)) return rateLimitResponse();

  const column = await prisma.column.findUnique({ where: { id } });
  if (!column) {
    return NextResponse.json({ error: "Column not found" }, { status: 404 });
  }

  const body = await req.json();
  const updateData: Record<string, unknown> = {};

  // Rename — owner or admin only
  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    if (authUser && column.ownerUsername !== authUser && !isAdminUser(authUser)) {
      return NextResponse.json(
        { error: "Only the column owner or an admin can rename this column" },
        { status: 403 }
      );
    }
    updateData.name = body.name.trim();
  }

  // Lock/unlock — admin only (admins control lane policy across the board)
  if (body.locked !== undefined) {
    if (!authUser || !isAdminUser(authUser)) {
      return NextResponse.json(
        { error: "Only admins can lock or unlock columns" },
        { status: 403 }
      );
    }
    updateData.locked = Boolean(body.locked);
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.column.update({
    where: { id },
    data: updateData,
  });
  broadcast();
  return NextResponse.json(updated);
}
