import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";

export async function POST(req: Request) {
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    return NextResponse.json({ error: "ids must be a non-empty array of positive integers" }, { status: 400 });
  }
  await Promise.all(
    ids.map((id: number, index: number) =>
      prisma.list.update({ where: { id }, data: { order: index } })
    )
  );
  broadcast();
  return NextResponse.json({ ok: true });
}
