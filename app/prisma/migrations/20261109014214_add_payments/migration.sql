-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'EXPIRED', 'CANCELLED', 'REJECTED');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "checkout_id" VARCHAR(64) NOT NULL,
    "checkout_url" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_checkout_id_key" ON "payments"("checkout_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_pending_work_order_id_key" ON "payments"("work_order_id") WHERE ("status" = 'PENDING');
