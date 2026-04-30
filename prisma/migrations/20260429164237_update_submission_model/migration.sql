/*
  Warnings:

  - You are about to drop the column `executionTimeMs` on the `Submission` table. All the data in the column will be lost.
  - You are about to drop the column `sourceCode` on the `Submission` table. All the data in the column will be lost.
  - Added the required column `code` to the `Submission` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Submission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "problemId" INTEGER,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "time" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Submission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Submission" ("createdAt", "id", "problemId", "status", "userId") SELECT "createdAt", "id", "problemId", "status", "userId" FROM "Submission";
DROP TABLE "Submission";
ALTER TABLE "new_Submission" RENAME TO "Submission";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
