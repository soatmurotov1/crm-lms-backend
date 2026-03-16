/*
  Warnings:

  - You are about to drop the column `status` on the `HomeworkResponse` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "HomeworkStatus" ADD VALUE 'NOT_REVIEWED';

-- AlterTable
ALTER TABLE "HomeworkResponse" DROP COLUMN "status";

-- DropEnum
DROP TYPE "HomeworkStatusStudent";
