-- CreateTable
CREATE TABLE "StockValuationSnapshot" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "period" VARCHAR(16) NOT NULL DEFAULT 'WEEK',
    "tradeDate" TIMESTAMP(3) NOT NULL,
    "close" DOUBLE PRECISION,
    "totalMarketCap" DOUBLE PRECISION,
    "circulatingMarketCap" DOUBLE PRECISION,
    "totalShares" DOUBLE PRECISION,
    "floatShares" DOUBLE PRECISION,
    "freeShares" DOUBLE PRECISION,
    "pe" DOUBLE PRECISION,
    "peTtm" DOUBLE PRECISION,
    "pb" DOUBLE PRECISION,
    "dividendYield" DOUBLE PRECISION,
    "dividendYieldTtm" DOUBLE PRECISION,
    "deductedNetProfitTtm" DOUBLE PRECISION,
    "deductedPe" DOUBLE PRECISION,
    "source" VARCHAR(80) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockValuationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockValuationSnapshot_symbol_period_tradeDate_key" ON "StockValuationSnapshot"("symbol", "period", "tradeDate");

-- CreateIndex
CREATE INDEX "StockValuationSnapshot_symbol_period_tradeDate_idx" ON "StockValuationSnapshot"("symbol", "period", "tradeDate");

-- CreateIndex
CREATE INDEX "StockValuationSnapshot_tradeDate_idx" ON "StockValuationSnapshot"("tradeDate");

-- CreateIndex
CREATE INDEX "StockValuationSnapshot_source_idx" ON "StockValuationSnapshot"("source");