-- CreateTable
CREATE TABLE "StockFinancialStatement" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "statement" VARCHAR(32) NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "reportName" VARCHAR(80),
    "fields" JSONB NOT NULL,
    "source" VARCHAR(80) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockFinancialStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockFinancialStatement_symbol_statement_reportDate_key" ON "StockFinancialStatement"("symbol", "statement", "reportDate");

-- CreateIndex
CREATE INDEX "StockFinancialStatement_symbol_statement_reportDate_idx" ON "StockFinancialStatement"("symbol", "statement", "reportDate");

-- CreateIndex
CREATE INDEX "StockFinancialStatement_statement_idx" ON "StockFinancialStatement"("statement");