-- CreateTable
CREATE TABLE "UserLifeAnalysisProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "profile" JSONB NOT NULL,
    "prompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLifeAnalysisProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLifeAnalysisReport" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "reportKey" VARCHAR(120) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "prompt" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLifeAnalysisReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserLifeAnalysisProfile_userId_key" ON "UserLifeAnalysisProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserLifeAnalysisReport_userId_reportKey_key" ON "UserLifeAnalysisReport"("userId", "reportKey");

-- CreateIndex
CREATE INDEX "UserLifeAnalysisReport_userId_createdAt_idx" ON "UserLifeAnalysisReport"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserLifeAnalysisProfile" ADD CONSTRAINT "UserLifeAnalysisProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLifeAnalysisReport" ADD CONSTRAINT "UserLifeAnalysisReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;