-- 1-bosqich: filiallar, kurs turi, xodim emaili.
--
-- Faqat qo'shadi: hech narsa o'chirilmaydi. Har bir tashkilot uchun
-- "Asosiy filial" yaratiladi va mavjud guruh hamda o'quvchilar unga
-- biriktiriladi.

-- ============ 1. Kurs turi ============

CREATE TYPE "CourseType" AS ENUM ('EXPRESS', 'AUTO_SCHOOL');
ALTER TABLE "Course" ADD COLUMN "type" "CourseType" NOT NULL DEFAULT 'AUTO_SCHOOL';

-- ============ 2. Xodim emaili ============

ALTER TABLE "User" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- ============ 3. Branch ============

CREATE TABLE "Branch" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "managerId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "organizationId" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Branch_organizationId_name_key" ON "Branch"("organizationId", "name");

ALTER TABLE "Branch" ADD CONSTRAINT "Branch_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============ 4. Guruh va o'quvchini filialga bog'lash ============

ALTER TABLE "Group" ADD COLUMN "branchId" INTEGER;
ALTER TABLE "Student" ADD COLUMN "branchId" INTEGER;

CREATE INDEX "Group_branchId_idx" ON "Group"("branchId");
CREATE INDEX "Student_branchId_idx" ON "Student"("branchId");

ALTER TABLE "Group" ADD CONSTRAINT "Group_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Student" ADD CONSTRAINT "Student_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============ 5. Ma'lumot ko'chirish ============

INSERT INTO "Branch" ("name", "organizationId", "updated_at")
SELECT 'Asosiy filial', o."id", CURRENT_TIMESTAMP
FROM "Organization" o;

UPDATE "Group" g
SET "branchId" = b."id"
FROM "Branch" b
WHERE b."organizationId" = g."organizationId" AND b."name" = 'Asosiy filial';

UPDATE "Student" s
SET "branchId" = b."id"
FROM "Branch" b
WHERE b."organizationId" = s."organizationId" AND b."name" = 'Asosiy filial';
