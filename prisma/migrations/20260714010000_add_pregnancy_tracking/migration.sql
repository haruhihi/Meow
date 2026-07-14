-- CreateTable
CREATE TABLE "PregnancyProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "startDate" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PregnancyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PregnancyCaution" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "startDate" VARCHAR(10) NOT NULL,
    "endDate" VARCHAR(10) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PregnancyCaution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PregnancyDailyRecord" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "recordDate" VARCHAR(10) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PregnancyDailyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PregnancyProfile_userId_key" ON "PregnancyProfile"("userId");

-- CreateIndex
CREATE INDEX "PregnancyCaution_userId_startDate_idx" ON "PregnancyCaution"("userId", "startDate");

-- CreateIndex
CREATE INDEX "PregnancyCaution_userId_endDate_idx" ON "PregnancyCaution"("userId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "PregnancyDailyRecord_userId_recordDate_key" ON "PregnancyDailyRecord"("userId", "recordDate");

-- CreateIndex
CREATE INDEX "PregnancyDailyRecord_userId_recordDate_idx" ON "PregnancyDailyRecord"("userId", "recordDate");

-- AddForeignKey
ALTER TABLE "PregnancyProfile" ADD CONSTRAINT "PregnancyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PregnancyCaution" ADD CONSTRAINT "PregnancyCaution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PregnancyDailyRecord" ADD CONSTRAINT "PregnancyDailyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
