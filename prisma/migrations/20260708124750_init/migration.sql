/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "FileSystem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isFolder" BOOLEAN NOT NULL DEFAULT false,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModified" TIMESTAMP(3) NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "path" TEXT NOT NULL,
    "bucketName" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FileSystem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileSystem_name_idx" ON "FileSystem"("name");

-- CreateIndex
CREATE INDEX "FileSystem_path_idx" ON "FileSystem"("path");

-- CreateIndex
CREATE INDEX "FileSystem_deletedAt_idx" ON "FileSystem"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FileSystem_path_bucketName_key" ON "FileSystem"("path", "bucketName");
