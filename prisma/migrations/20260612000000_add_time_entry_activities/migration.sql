-- CreateTable
CREATE TABLE "TimeEntryActivity" (
    "id" SERIAL NOT NULL,
    "timeEntryId" INTEGER NOT NULL,
    "activityTypeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntryActivity_pkey" PRIMARY KEY ("id")
);

-- Backfill existing time entries as single-activity entries.
INSERT INTO "TimeEntryActivity" ("timeEntryId", "activityTypeId", "createdAt", "updatedAt")
SELECT "id", "activityTypeId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TimeEntry";

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntryActivity_timeEntryId_activityTypeId_key" ON "TimeEntryActivity"("timeEntryId", "activityTypeId");

-- CreateIndex
CREATE INDEX "TimeEntryActivity_timeEntryId_idx" ON "TimeEntryActivity"("timeEntryId");

-- CreateIndex
CREATE INDEX "TimeEntryActivity_activityTypeId_idx" ON "TimeEntryActivity"("activityTypeId");

-- AddForeignKey
ALTER TABLE "TimeEntryActivity" ADD CONSTRAINT "TimeEntryActivity_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntryActivity" ADD CONSTRAINT "TimeEntryActivity_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;