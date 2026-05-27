-- CreateTable
CREATE TABLE "StockSnapshot" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshotMonth" VARCHAR(7) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockSnapshot_userId_snapshotAt_idx" ON "StockSnapshot"("userId", "snapshotAt");

-- CreateIndex
CREATE INDEX "StockSnapshot_userId_snapshotMonth_idx" ON "StockSnapshot"("userId", "snapshotMonth");

-- CreateIndex
CREATE INDEX "StockSnapshot_source_idx" ON "StockSnapshot"("source");

-- AddForeignKey
ALTER TABLE "StockSnapshot" ADD CONSTRAINT "StockSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;