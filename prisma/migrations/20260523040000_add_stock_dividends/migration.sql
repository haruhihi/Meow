-- CreateTable
CREATE TABLE "StockDividendEvent" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "announcementDate" TIMESTAMP(3),
    "recordDate" TIMESTAMP(3),
    "exDividendDate" TIMESTAMP(3) NOT NULL,
    "paymentDate" TIMESTAMP(3),
    "cashPerTen" DOUBLE PRECISION,
    "bonusSharesPerTen" DOUBLE PRECISION,
    "transferSharesPerTen" DOUBLE PRECISION,
    "dividendBaseShares" DOUBLE PRECISION,
    "status" VARCHAR(80),
    "description" VARCHAR(255),
    "source" VARCHAR(80) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockDividendEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockDividendMarking" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventId" INTEGER NOT NULL,
    "countTowardNormalizedDividend" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockDividendMarking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockDividendEvent_symbol_exDividendDate_key" ON "StockDividendEvent"("symbol", "exDividendDate");

-- CreateIndex
CREATE INDEX "StockDividendEvent_symbol_idx" ON "StockDividendEvent"("symbol");

-- CreateIndex
CREATE INDEX "StockDividendEvent_exDividendDate_idx" ON "StockDividendEvent"("exDividendDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockDividendMarking_userId_eventId_key" ON "StockDividendMarking"("userId", "eventId");

-- CreateIndex
CREATE INDEX "StockDividendMarking_userId_idx" ON "StockDividendMarking"("userId");

-- CreateIndex
CREATE INDEX "StockDividendMarking_eventId_idx" ON "StockDividendMarking"("eventId");

-- AddForeignKey
ALTER TABLE "StockDividendMarking" ADD CONSTRAINT "StockDividendMarking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDividendMarking" ADD CONSTRAINT "StockDividendMarking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "StockDividendEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
