/*
  Warnings:

  - Added the required column `groupId` to the `LessonVideo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LessonVideo" ADD COLUMN     "groupId" INTEGER NOT NULL;
