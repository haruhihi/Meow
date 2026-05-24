-- AlterTable
ALTER TABLE "StockDividendEvent" ADD COLUMN "eventKey" VARCHAR(160);

-- BackfillEventKey
UPDATE "StockDividendEvent"
SET "eventKey" =
  "symbol" || ':' ||
  COALESCE(to_char("exDividendDate", 'YYYY-MM-DD'), to_char("announcementDate", 'YYYY-MM-DD'), "id"::text) || ':' ||
  md5(COALESCE("description", ''));

-- AlterTable
ALTER TABLE "StockDividendEvent" ALTER COLUMN "eventKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "StockDividendEvent" ALTER COLUMN "exDividendDate" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "StockDividendEvent_eventKey_key" ON "StockDividendEvent"("eventKey");

-- CreateIndex
CREATE INDEX "StockDividendEvent_announcementDate_idx" ON "StockDividendEvent"("announcementDate");
