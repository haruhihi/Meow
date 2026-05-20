-- Remove default time activity types that were seeded before this migration.
-- Keep rows that already have time entries so historical records remain valid.
DELETE FROM "ActivityType"
WHERE "name" IN ('吃饭', '通勤')
  AND NOT EXISTS (
    SELECT 1
    FROM "TimeEntry"
    WHERE "TimeEntry"."activityTypeId" = "ActivityType"."id"
  );
