import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/events";
import { isAdminUser } from "@/lib/lane-guard";

export async function POST(req: Request) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const existing = await prisma.column.findMany();
  if (existing.length > 0) {
    return NextResponse.json({ message: "Already seeded", columns: existing });
  }

  const dave = await prisma.column.create({
    data: {
      name: "Dave",
      slug: "dave",
      order: 0,
      lists: { create: [{ name: "Tasks", order: 0 }] },
    },
  });

  const claude = await prisma.column.create({
    data: {
      name: "Claude",
      slug: "claude",
      order: 1,
      lists: { create: [{ name: "Tasks", order: 0 }] },
    },
  });

  broadcast();
  return NextResponse.json(
    { message: "Seeded", columns: [dave, claude] },
    { status: 201 }
  );
}
