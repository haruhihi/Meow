-- CreateTable
CREATE TABLE "StockRemark" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "remarkDate" VARCHAR(10) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockRemark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockRemark_userId_symbol_remarkDate_key" ON "StockRemark"("userId", "symbol", "remarkDate");

-- CreateIndex
CREATE INDEX "StockRemark_userId_symbol_remarkDate_idx" ON "StockRemark"("userId", "symbol", "remarkDate");

-- CreateIndex
CREATE INDEX "StockRemark_symbol_idx" ON "StockRemark"("symbol");

-- AddForeignKey
ALTER TABLE "StockRemark" ADD CONSTRAINT "StockRemark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;