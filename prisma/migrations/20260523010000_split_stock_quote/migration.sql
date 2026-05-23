-- CreateTable
CREATE TABLE "StockQuote" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "currentPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockQuote_pkey" PRIMARY KEY ("id")
);

-- BackfillQuote
INSERT INTO "StockQuote" ("userId", "symbol", "name", "currentPrice", "createdAt", "updatedAt")
SELECT DISTINCT ON ("userId", "symbol")
    "userId",
    "symbol",
    "name",
    "currentPrice",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "StockHolding"
ORDER BY "userId", "symbol", "updatedAt" DESC, "id" DESC;

-- CreateIndex
CREATE UNIQUE INDEX "StockQuote_userId_symbol_key" ON "StockQuote"("userId", "symbol");

-- CreateIndex
CREATE INDEX "StockQuote_userId_idx" ON "StockQuote"("userId");

-- CreateIndex
CREATE INDEX "StockQuote_symbol_idx" ON "StockQuote"("symbol");

-- AddForeignKey
ALTER TABLE "StockQuote" ADD CONSTRAINT "StockQuote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "StockHolding" DROP COLUMN "name",
DROP COLUMN "currentPrice";
