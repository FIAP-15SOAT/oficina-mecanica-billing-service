-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'SENT', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "services_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "parts_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "sent_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "replaced_by_quote_id" UUID,
    "rejection_reason" TEXT,
    "decided_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_services" (
    "quote_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_services_pkey" PRIMARY KEY ("quote_id","service_id")
);

-- CreateTable
CREATE TABLE "quote_part_supplies" (
    "quote_id" UUID NOT NULL,
    "part_supply_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_part_supplies_pkey" PRIMARY KEY ("quote_id","part_supply_id")
);

-- CreateIndex
CREATE INDEX "quotes_work_order_id_status_idx" ON "quotes"("work_order_id", "status");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quote_services_service_id_idx" ON "quote_services"("service_id");

-- CreateIndex
CREATE INDEX "quote_part_supplies_part_supply_id_idx" ON "quote_part_supplies"("part_supply_id");

-- AddForeignKey
ALTER TABLE "quote_services" ADD CONSTRAINT "quote_services_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_part_supplies" ADD CONSTRAINT "quote_part_supplies_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
