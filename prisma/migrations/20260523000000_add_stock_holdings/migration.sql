-- CreateTable
CREATE TABLE "StockAccount" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockHolding" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "currentPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockHolding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockAccount_userId_name_key" ON "StockAccount"("userId", "name");

-- CreateIndex
CREATE INDEX "StockAccount_userId_sortOrder_idx" ON "StockAccount"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StockHolding_userId_accountId_symbol_key" ON "StockHolding"("userId", "accountId", "symbol");

-- CreateIndex
CREATE INDEX "StockHolding_userId_idx" ON "StockHolding"("userId");

-- CreateIndex
CREATE INDEX "StockHolding_accountId_idx" ON "StockHolding"("accountId");

-- CreateIndex
CREATE INDEX "StockHolding_symbol_idx" ON "StockHolding"("symbol");

-- AddForeignKey
ALTER TABLE "StockAccount" ADD CONSTRAINT "StockAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHolding" ADD CONSTRAINT "StockHolding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHolding" ADD CONSTRAINT "StockHolding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StockAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
