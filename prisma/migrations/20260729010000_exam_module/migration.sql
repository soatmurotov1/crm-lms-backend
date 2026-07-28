-- Exams moduli uchun sxema. Exam/ExamResponse jadvallari ba'zi bazalarda
-- allaqachon mavjud (ular `prisma db push` orqali yaratilgan), shuning uchun
-- barcha amallar "IF NOT EXISTS" bilan himoyalangan - migratsiya ikkala
-- holatda ham xatosiz o'tadi.

-- CreateTable
CREATE TABLE IF NOT EXISTS "Exam" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "lessonId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExamResponse" (
    "id" SERIAL NOT NULL,
    "examId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "comment" TEXT,
    "file" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamResponse_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Exam'ning yangi ustunlari
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "courseId" INTEGER;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "teacherId" INTEGER;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "userId" INTEGER;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "durationTime" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "maxScore" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "status" "Status" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable: ExamResponse'ning yangi ustunlari
ALTER TABLE "ExamResponse" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "ExamResponse" ADD COLUMN IF NOT EXISTS "comment" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExamResult" (
    "id" SERIAL NOT NULL,
    "examId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "teacherId" INTEGER,
    "userId" INTEGER,
    "comment" TEXT,
    "score" INTEGER NOT NULL,
    "status" "HomeworkStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "userType" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Homework" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ExamResponse_examId_studentId_key" ON "ExamResponse"("examId", "studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExamResult_examId_studentId_key" ON "ExamResult"("examId", "studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_token_key" ON "RefreshToken"("token");

-- AddForeignKey: FK'lar takrorlanmasligi uchun avval bor bo'lsa o'chiramiz.
ALTER TABLE "Exam" DROP CONSTRAINT IF EXISTS "Exam_groupId_fkey";
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Exam" DROP CONSTRAINT IF EXISTS "Exam_lessonId_fkey";
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Exam" DROP CONSTRAINT IF EXISTS "Exam_courseId_fkey";
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Exam" DROP CONSTRAINT IF EXISTS "Exam_teacherId_fkey";
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Exam" DROP CONSTRAINT IF EXISTS "Exam_userId_fkey";
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExamResponse" DROP CONSTRAINT IF EXISTS "ExamResponse_examId_fkey";
ALTER TABLE "ExamResponse" ADD CONSTRAINT "ExamResponse_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExamResponse" DROP CONSTRAINT IF EXISTS "ExamResponse_studentId_fkey";
ALTER TABLE "ExamResponse" ADD CONSTRAINT "ExamResponse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExamResult" DROP CONSTRAINT IF EXISTS "ExamResult_examId_fkey";
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExamResult" DROP CONSTRAINT IF EXISTS "ExamResult_studentId_fkey";
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExamResult" DROP CONSTRAINT IF EXISTS "ExamResult_teacherId_fkey";
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExamResult" DROP CONSTRAINT IF EXISTS "ExamResult_userId_fkey";
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
