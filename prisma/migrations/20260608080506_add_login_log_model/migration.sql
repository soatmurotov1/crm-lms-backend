-- CreateTable
CREATE TABLE "LoginLog" (
    "id" SERIAL NOT NULL,
    "userEmail" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "deviceName" TEXT,
    "location" TEXT,
    "userAgent" TEXT,
    "loginType" TEXT NOT NULL DEFAULT 'user',
    "success" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginLog_pkey" PRIMARY KEY ("id")
);
