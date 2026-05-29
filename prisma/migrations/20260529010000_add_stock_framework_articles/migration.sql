-- CreateTable
CREATE TABLE "StockFrameworkArticle" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "articleId" VARCHAR(40) NOT NULL,
    "title" VARCHAR(200),
    "reason" VARCHAR(500),
    "tags" JSONB,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockFrameworkArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockFrameworkArticle_userId_symbol_articleId_key" ON "StockFrameworkArticle"("userId", "symbol", "articleId");

-- CreateIndex
CREATE INDEX "StockFrameworkArticle_userId_symbol_idx" ON "StockFrameworkArticle"("userId", "symbol");

-- CreateIndex
CREATE INDEX "StockFrameworkArticle_articleId_idx" ON "StockFrameworkArticle"("articleId");

-- AddForeignKey
ALTER TABLE "StockFrameworkArticle" ADD CONSTRAINT "StockFrameworkArticle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;