-- CreateTable
CREATE TABLE "PaymeTransaction" (
    "id" SERIAL NOT NULL,
    "paycomId" TEXT NOT NULL,
    "paycomTime" BIGINT NOT NULL,
    "createTime" BIGINT NOT NULL DEFAULT 0,
    "performTime" BIGINT NOT NULL DEFAULT 0,
    "cancelTime" BIGINT NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL,
    "state" INTEGER NOT NULL DEFAULT 1,
    "reason" INTEGER,
    "paymentId" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymeTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymeTransaction_paycomId_key" ON "PaymeTransaction"("paycomId");

-- CreateIndex
CREATE INDEX "PaymeTransaction_paymentId_idx" ON "PaymeTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "PaymeTransaction_paycomTime_idx" ON "PaymeTransaction"("paycomTime");

-- CreateIndex
CREATE INDEX "PaymeTransaction_state_idx" ON "PaymeTransaction"("state");

-- AddForeignKey
ALTER TABLE "PaymeTransaction" ADD CONSTRAINT "PaymeTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
