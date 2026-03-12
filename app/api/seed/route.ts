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

  // Use the actual admin username for their column, and the configured
  // agent name (from setup wizard) or a generic default for the agent column.
  const adminName = authUser;
  const agentName = process.env.AGENT_COLUMN_NAME || "Agent";
  const agentSlug = agentName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();

  const userColumn = await prisma.column.create({
    data: {
      name: adminName,
      slug: adminName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      ownerUsername: adminName,
      order: 0,
      lists: { create: [{ name: "Tasks", order: 0 }] },
    },
  });

  const agentColumn = await prisma.column.create({
    data: {
      name: agentName,
      slug: agentSlug,
      order: 1,
      lists: { create: [{ name: "Tasks", order: 0 }] },
    },
  });

  broadcast();
  return NextResponse.json(
    { message: "Seeded", columns: [userColumn, agentColumn] },
    { status: 201 }
  );
}
