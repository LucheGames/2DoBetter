import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existingColumns = await prisma.column.findMany();
  if (existingColumns.length > 0) {
    console.log("Seed: Columns already exist, skipping.");
    return;
  }

  const dave = await prisma.column.create({
    data: {
      name: "Dave",
      slug: "dave",
      order: 0,
      lists: {
        create: [{ name: "Tasks", order: 0 }],
      },
    },
  });

  const claude = await prisma.column.create({
    data: {
      name: "Claude",
      slug: "claude",
      order: 1,
      lists: {
        create: [{ name: "Tasks", order: 0 }],
      },
    },
  });

  console.log(
    `Seed: Created columns "${dave.name}" and "${claude.name}" with default lists.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
