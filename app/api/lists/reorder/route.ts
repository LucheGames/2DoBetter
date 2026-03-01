import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { ids } = await req.json();
  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  await Promise.all(
    ids.map((id: number, index: number) =>
      prisma.list.update({ where: { id }, data: { order: index } })
    )
  );
  return NextResponse.json({ ok: true });
}
