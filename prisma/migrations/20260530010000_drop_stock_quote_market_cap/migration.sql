-- Keep live quote rows limited to mutable price data. Market cap is derived from price and Xueqiu-synced total shares.
ALTER TABLE "StockQuote" DROP COLUMN IF EXISTS "marketCap";