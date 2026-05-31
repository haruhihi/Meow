ALTER TABLE "StockFundamental"
  DROP COLUMN IF EXISTS "deductedNetProfitTtm",
  DROP COLUMN IF EXISTS "netProfitTtm",
  DROP COLUMN IF EXISTS "revenueTtm",
  DROP COLUMN IF EXISTS "operatingCashFlowTtm",
  DROP COLUMN IF EXISTS "capitalExpenditureTtm";

ALTER TABLE "StockValuationSnapshot"
  DROP COLUMN IF EXISTS "deductedNetProfitTtm",
  DROP COLUMN IF EXISTS "deductedPe";