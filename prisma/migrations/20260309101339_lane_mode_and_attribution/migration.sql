-- AlterTable
ALTER TABLE "Task" ADD COLUMN "createdBy" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Column" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerUsername" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Column" ("createdAt", "id", "name", "order", "ownerUsername", "slug") SELECT "createdAt", "id", "name", "order", "ownerUsername", "slug" FROM "Column";
DROP TABLE "Column";
ALTER TABLE "new_Column" RENAME TO "Column";
CREATE UNIQUE INDEX "Column_slug_key" ON "Column"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
