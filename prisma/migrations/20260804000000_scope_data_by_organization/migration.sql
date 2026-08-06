-- Har bir tashkilotning ma'lumoti alohida saqlanadi.
--
-- Shu paytgacha Course, Room, Teacher, Student va Group hech qaysi tashkilotga
-- bog'lanmagan edi: yangi tashkilot ochilganda u boshqa tashkilotning kurslari,
-- xonalari, xodimlari va guruhlarini ko'rardi. Endi har biri `organizationId`
-- bilan biriktiriladi.

-- ============ 1. Ustunlar ============

ALTER TABLE "Teacher" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "Student" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "Course"  ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "Room"    ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "Group"   ADD COLUMN "organizationId" INTEGER;

-- ============ 2. Mavjud ma'lumotni biriktirish ============
--
-- Eski yozuvlar eng birinchi ochilgan tashkilotga o'tadi. Tashkilot umuman
-- bo'lmasa (bo'sh baza) ustunlar NULL bo'lib qoladi va hech narsa yo'qolmaydi.

DO $$
DECLARE
  default_org_id INTEGER;
BEGIN
  SELECT "id" INTO default_org_id
  FROM "Organization"
  ORDER BY "created_at" ASC, "id" ASC
  LIMIT 1;

  IF default_org_id IS NOT NULL THEN
    UPDATE "Teacher" SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "Student" SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "Course"  SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "Room"    SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "Group"   SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
  END IF;
END $$;

-- ============ 3. Nomlar bo'yicha cheklovlar ============
--
-- Kurs va xona nomi butun tizim bo'ylab yagona edi — ya'ni ikki tashkilot bir
-- xil nomli xona ("101") ocha olmasdi. Endi cheklov tashkilot ichida.

ALTER TABLE "Course" DROP CONSTRAINT IF EXISTS "Course_name_key";
DROP INDEX IF EXISTS "Course_name_key";
CREATE UNIQUE INDEX "Course_organizationId_name_key"
  ON "Course"("organizationId", "name");

ALTER TABLE "Room" DROP CONSTRAINT IF EXISTS "Room_name_key";
DROP INDEX IF EXISTS "Room_name_key";
CREATE UNIQUE INDEX "Room_organizationId_name_key"
  ON "Room"("organizationId", "name");

-- Guruh nomi allaqachon kurs bilan birga yagona (`Group_courseId_name_key`),
-- kurs esa bitta tashkilotga tegishli — global cheklov ortiqcha.
ALTER TABLE "Group" DROP CONSTRAINT IF EXISTS "Group_name_key";
DROP INDEX IF EXISTS "Group_name_key";

-- ============ 4. Tashqi kalitlar va indekslar ============

ALTER TABLE "Teacher"
  ADD CONSTRAINT "Teacher_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Student"
  ADD CONSTRAINT "Student_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Course"
  ADD CONSTRAINT "Course_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Room"
  ADD CONSTRAINT "Room_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Group"
  ADD CONSTRAINT "Group_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Teacher_organizationId_idx" ON "Teacher"("organizationId");
CREATE INDEX "Student_organizationId_idx" ON "Student"("organizationId");
CREATE INDEX "Course_organizationId_idx"  ON "Course"("organizationId");
CREATE INDEX "Room_organizationId_idx"    ON "Room"("organizationId");
CREATE INDEX "Group_organizationId_idx"   ON "Group"("organizationId");
