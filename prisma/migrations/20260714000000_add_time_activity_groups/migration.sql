-- CreateEnum
CREATE TYPE "TimeActivityGroupTargetDirection" AS ENUM ('AT_LEAST', 'AT_MOST');

-- CreateTable
CREATE TABLE "TimeActivityGroup" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "color" VARCHAR(16) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "targetMinutes" INTEGER NOT NULL,
    "targetDirection" "TimeActivityGroupTargetDirection" NOT NULL DEFAULT 'AT_LEAST',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeActivityGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ActivityType" ADD COLUMN "groupId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "TimeActivityGroup_userId_name_key" ON "TimeActivityGroup"("userId", "name");

-- CreateIndex
CREATE INDEX "TimeActivityGroup_userId_sortOrder_idx" ON "TimeActivityGroup"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "ActivityType_groupId_idx" ON "ActivityType"("groupId");

-- AddForeignKey
ALTER TABLE "TimeActivityGroup" ADD CONSTRAINT "TimeActivityGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityType" ADD CONSTRAINT "ActivityType_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TimeActivityGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the initial editable groups for every current user. Existing rows are left untouched.
INSERT INTO "TimeActivityGroup" (
    "userId",
    "name",
    "color",
    "sortOrder",
    "targetMinutes",
    "targetDirection",
    "createdAt",
    "updatedAt"
)
SELECT
    "User"."id",
    defaults."name",
    defaults."color",
    defaults."sortOrder",
    defaults."targetMinutes",
    defaults."targetDirection"::"TimeActivityGroupTargetDirection",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User"
CROSS JOIN (
    VALUES
        ('屏幕', '#FF3D71', 0, 120, 'AT_MOST'),
        ('休息', '#6D5DF6', 1, 480, 'AT_LEAST'),
        ('运动', '#00B86B', 2, 30, 'AT_LEAST'),
        ('学习', '#00A7A7', 3, 60, 'AT_LEAST')
) AS defaults("name", "color", "sortOrder", "targetMinutes", "targetDirection")
ON CONFLICT ("userId", "name") DO NOTHING;

-- Assign only previously ungrouped activities so a replay never replaces a user's choice.
WITH defaults("activityName", "groupName") AS (
    VALUES
        ('手机', '屏幕'),
        ('电视', '屏幕'),
        ('睡眠', '休息'),
        ('闭目', '休息'),
        ('运动', '运动'),
        ('步行', '运动'),
        ('学习', '学习'),
        ('阅读', '学习')
)
UPDATE "ActivityType" AS activity
SET "groupId" = time_group."id"
FROM defaults, "TimeActivityGroup" AS time_group
WHERE activity."userId" = time_group."userId"
  AND activity."name" = defaults."activityName"
  AND time_group."name" = defaults."groupName"
  AND activity."groupId" IS NULL;
