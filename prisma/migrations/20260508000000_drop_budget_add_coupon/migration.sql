-- DropForeignKey
ALTER TABLE "Budget" DROP CONSTRAINT IF EXISTS "Budget_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "_UserBudgets" DROP CONSTRAINT IF EXISTS "_UserBudgets_A_fkey";

-- DropForeignKey
ALTER TABLE "_UserBudgets" DROP CONSTRAINT IF EXISTS "_UserBudgets_B_fkey";

-- DropTable
DROP TABLE IF EXISTS "_UserBudgets";

-- DropTable
DROP TABLE IF EXISTS "Budget";

-- CreateTable
CREATE TABLE "Coupon" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(80),
    "amount" DOUBLE PRECISION NOT NULL,
    "remainingAmount" DOUBLE PRECISION NOT NULL,
    "validYear" INTEGER NOT NULL,
    "validMonth" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "seedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "couponId" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "couponName" VARCHAR(255);
ALTER TABLE "Transaction" ADD COLUMN "couponDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_seedKey_key" ON "Coupon"("seedKey");

-- CreateIndex
CREATE INDEX "Coupon_validYear_validMonth_idx" ON "Coupon"("validYear", "validMonth");

-- CreateIndex
CREATE INDEX "Coupon_name_idx" ON "Coupon"("name");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;