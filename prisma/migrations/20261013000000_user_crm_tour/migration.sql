-- Yangi panel (/api/v2): tanishtiruv turi ko'rsatilganini eslab qolish.
-- Faqat qo'shadi.

ALTER TABLE "User" ADD COLUMN "crmTourCompletedAt" TIMESTAMP(3);
