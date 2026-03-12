import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existingColumns = await prisma.column.findMany();
  if (existingColumns.length > 0) {
    console.log("Seed: Columns already exist, skipping.");
    return;
  }

  const userColumn = await prisma.column.create({
    data: {
      name: "User",
      slug: "user",
      order: 0,
      lists: {
        create: [{ name: "Tasks", order: 0 }],
      },
    },
  });

  const agentColumn = await prisma.column.create({
    data: {
      name: "Agent",
      slug: "agent",
      order: 1,
      lists: {
        create: [{ name: "Tasks", order: 0 }],
      },
    },
  });

  console.log(
    `Seed: Created columns "${userColumn.name}" and "${agentColumn.name}" with default lists.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
