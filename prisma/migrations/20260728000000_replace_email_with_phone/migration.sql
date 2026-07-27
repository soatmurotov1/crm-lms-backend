-- Email maydoni olib tashlandi, uning o'rniga login identifikatori sifatida
-- telefon raqami ishlatiladi. Mavjud ma'lumot yo'qolmasligi uchun ustunlar
-- o'chirilmay, nomi almashtiriladi.

-- AlterTable
ALTER TABLE "User" RENAME COLUMN "email" TO "phone";
ALTER TABLE "Teacher" RENAME COLUMN "email" TO "phone";
ALTER TABLE "Student" RENAME COLUMN "email" TO "phone";
ALTER TABLE "LoginLog" RENAME COLUMN "userEmail" TO "userPhone";

-- RenameIndex
ALTER INDEX "User_email_key" RENAME TO "User_phone_key";
ALTER INDEX "Teacher_email_key" RENAME TO "Teacher_phone_key";
ALTER INDEX "Student_email_key" RENAME TO "Student_phone_key";
