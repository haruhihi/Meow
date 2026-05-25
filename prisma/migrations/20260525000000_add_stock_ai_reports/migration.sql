-- CreateTable
CREATE TABLE "StockAiReport" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "content" TEXT NOT NULL,
    "sourceLinks" JSONB NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockAiReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockAiReport_userId_slug_key" ON "StockAiReport"("userId", "slug");

-- CreateIndex
CREATE INDEX "StockAiReport_userId_reportDate_idx" ON "StockAiReport"("userId", "reportDate");

-- CreateIndex
CREATE INDEX "StockAiReport_symbol_idx" ON "StockAiReport"("symbol");

-- AddForeignKey
ALTER TABLE "StockAiReport" ADD CONSTRAINT "StockAiReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;