-- Remove deprecated default time activity types that are not referenced by time entries.
-- Referenced rows stay in place so existing history remains readable.
DELETE FROM "ActivityType"
WHERE "name" IN ('吃饭', '通勤', '其他')
  AND NOT EXISTS (
    SELECT 1
    FROM "TimeEntry"
    WHERE "TimeEntry"."activityTypeId" = "ActivityType"."id"
  );
