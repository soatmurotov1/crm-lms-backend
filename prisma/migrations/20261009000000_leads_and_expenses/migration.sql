-- Lidlar (CRM voronkasi) va xarajatlar bo'limlari.
--
-- Ikkalasi ham tashkilot bo'yicha ajratiladi: `organizationId` orqali bitta
-- markaz boshqasining lidlari va xarajatlarini ko'rmaydi.

-- ============ 1. Enumlar ============

CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'TRIAL', 'CONTRACT', 'WON', 'LOST');
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'PAID');

-- ============ 2. Lead ============

CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" TEXT,
    "note" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "courseId" INTEGER,
    "assignedToId" INTEGER,
    "nextContactAt" TIMESTAMP(3),
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "organizationId" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Lead_organizationId_stage_idx" ON "Lead"("organizationId", "stage");
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============ 3. Expense ============

CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "organizationId" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Expense_organizationId_status_idx" ON "Expense"("organizationId", "status");
CREATE INDEX "Expense_organizationId_dueDate_idx" ON "Expense"("organizationId", "dueDate");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
