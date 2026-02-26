import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  const list = await prisma.list.update({
    where: { id: Number(id) },
    data: { name: name.trim() },
  });
  return NextResponse.json(list);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.list.delete({ where: { id: Number(id) } });
  return new NextResponse(null, { status: 204 });
}
