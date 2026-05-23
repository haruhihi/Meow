-- CreateTable
CREATE TABLE "StockFundamental" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "totalShares" DOUBLE PRECISION,
    "deductedNetProfit" DOUBLE PRECISION,
    "netAsset" DOUBLE PRECISION,
    "source" VARCHAR(80) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockFundamental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMetricOverride" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "normalizedDividend" DOUBLE PRECISION,
    "note" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockMetricOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockFundamental_symbol_reportDate_key" ON "StockFundamental"("symbol", "reportDate");

-- CreateIndex
CREATE INDEX "StockFundamental_symbol_idx" ON "StockFundamental"("symbol");

-- CreateIndex
CREATE INDEX "StockFundamental_reportDate_idx" ON "StockFundamental"("reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockMetricOverride_userId_symbol_key" ON "StockMetricOverride"("userId", "symbol");

-- CreateIndex
CREATE INDEX "StockMetricOverride_userId_idx" ON "StockMetricOverride"("userId");

-- CreateIndex
CREATE INDEX "StockMetricOverride_symbol_idx" ON "StockMetricOverride"("symbol");

-- AddForeignKey
ALTER TABLE "StockMetricOverride" ADD CONSTRAINT "StockMetricOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
