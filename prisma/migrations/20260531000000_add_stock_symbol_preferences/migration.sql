-- CreateTable
CREATE TABLE "StockSymbolPreference" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockSymbolPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockSymbolPreference_userId_symbol_key" ON "StockSymbolPreference"("userId", "symbol");

-- CreateIndex
CREATE INDEX "StockSymbolPreference_userId_idx" ON "StockSymbolPreference"("userId");

-- CreateIndex
CREATE INDEX "StockSymbolPreference_symbol_idx" ON "StockSymbolPreference"("symbol");

-- CreateIndex
CREATE INDEX "StockSymbolPreference_userId_isHidden_idx" ON "StockSymbolPreference"("userId", "isHidden");

-- AddForeignKey
ALTER TABLE "StockSymbolPreference" ADD CONSTRAINT "StockSymbolPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;