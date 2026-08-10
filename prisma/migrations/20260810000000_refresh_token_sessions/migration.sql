-- Refresh token va sessiyani bekor qilish.
--
-- `RefreshToken` jadvali bor edi, lekin kodda umuman ishlatilmagan: access
-- token 2 soatdan keyin tugab, foydalanuvchi dars o'rtasida tizimdan chiqib
-- ketardi. Endi har bir kirish sessiya ochadi, `sessionId` esa access token
-- ichiga `sid` bo'lib yoziladi — qator o'chsa, token ham darhol kuchsizlanadi.

-- Jadval hech qachon to'ldirilmagan, ammo eski sinovlardan qator qolgan
-- bo'lishi mumkin. Ularda `sessionId` yo'q, ya'ni ishlatib bo'lmaydi.
DELETE FROM "RefreshToken";

ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "sessionId"  TEXT NOT NULL;
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "revokedAt"  TIMESTAMP(3);
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "userAgent"  TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "ipAddress"  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_sessionId_key"
  ON "RefreshToken"("sessionId");

-- Chiqishda va "hamma qurilmadan chiqish"da userId+userType bo'yicha,
-- tozalash cron'ida esa expiresAt bo'yicha qidiriladi.
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_userType_idx"
  ON "RefreshToken"("userId", "userType");

CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx"
  ON "RefreshToken"("expiresAt");

-- Muvaffaqiyatsiz kirishlar endi LoginLog ga yoziladi (ilgari faqat
-- `success = true` yozilardi). Brute-force tekshiruvi raqam va IP bo'yicha
-- so'raladi, shuning uchun indekslar qo'shildi.
CREATE INDEX IF NOT EXISTS "LoginLog_userPhone_created_at_idx"
  ON "LoginLog"("userPhone", "created_at");

CREATE INDEX IF NOT EXISTS "LoginLog_ipAddress_created_at_idx"
  ON "LoginLog"("ipAddress", "created_at");

-- Tashkilot admini faqat o'z xodimlarining urinishlarini ko'rishi kerak.
-- Eski qatorlarda ustun NULL bo'lib qoladi — ularni faqat SUPERADMIN ko'radi.
ALTER TABLE "LoginLog" ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;

CREATE INDEX IF NOT EXISTS "LoginLog_organizationId_success_created_at_idx"
  ON "LoginLog"("organizationId", "success", "created_at");
