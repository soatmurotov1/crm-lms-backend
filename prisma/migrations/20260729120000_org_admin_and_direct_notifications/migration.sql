-- Tashkilot adminlari: User endi tashkilotga biriktiriladi.
ALTER TABLE "User" ADD COLUMN "organizationId" INTEGER;

ALTER TABLE "User"
  ADD CONSTRAINT "User_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- Xabarnomani aniq tashkilotga yoki aniq shaxsga yuborish.
ALTER TYPE "NotificationAudience" ADD VALUE IF NOT EXISTS 'ORGANIZATION';
ALTER TYPE "NotificationAudience" ADD VALUE IF NOT EXISTS 'USER';

ALTER TABLE "Notification" ADD COLUMN "recipientRole" "Role";
ALTER TABLE "Notification" ADD COLUMN "recipientId" INTEGER;
ALTER TABLE "Notification" ADD COLUMN "recipientName" TEXT;

CREATE INDEX "Notification_recipientRole_recipientId_idx"
  ON "Notification"("recipientRole", "recipientId");
