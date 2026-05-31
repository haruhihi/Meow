-- Layer 2 derived stock metric cache. Values here are calculated from raw/source rows and must carry freshness metadata.
CREATE TABLE "StockMetricCache" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "domain" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "calculationVersion" INTEGER NOT NULL DEFAULT 1,
    "calculatedThroughReportDate" TIMESTAMP(3),
    "calculatedThroughReportName" VARCHAR(80),
    "calculatedThroughSnapshotDate" TIMESTAMP(3),
    "metrics" JSONB NOT NULL,
    "warnings" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockMetricCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockMetricCache_symbol_domain_key" ON "StockMetricCache"("symbol", "domain");
CREATE INDEX "StockMetricCache_symbol_idx" ON "StockMetricCache"("symbol");
CREATE INDEX "StockMetricCache_domain_status_idx" ON "StockMetricCache"("domain", "status");
CREATE INDEX "StockMetricCache_calculatedThroughReportDate_idx" ON "StockMetricCache"("calculatedThroughReportDate");
CREATE INDEX "StockMetricCache_calculatedThroughSnapshotDate_idx" ON "StockMetricCache"("calculatedThroughSnapshotDate");