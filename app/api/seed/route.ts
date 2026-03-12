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

  // Create only the admin's column. Every other user (human or agent)
  // gets their own column automatically on first login via ensureUserColumn().
  const adminName = authUser;
  const userColumn = await prisma.column.create({
    data: {
      name: adminName,
      slug: adminName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      ownerUsername: adminName,
      order: 0,
      lists: { create: [{ name: "Tasks", order: 0 }] },
    },
  });

  broadcast();
  return NextResponse.json(
    { message: "Seeded", columns: [userColumn] },
    { status: 201 }
  );
}
