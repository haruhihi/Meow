WITH renamed_activity_types("fromName", "toName", "toColor", "toIcon") AS (
  VALUES
    ('做饭', '家务', '#F97316', 'home')
), conflicts AS (
  SELECT source."id" AS "sourceId", target."id" AS "targetId"
  FROM "ActivityType" source
  JOIN renamed_activity_types renamed ON source."name" = renamed."fromName"
  JOIN "ActivityType" target
    ON target."userId" = source."userId"
   AND target."name" = renamed."toName"
)
UPDATE "TimeEntry"
SET "activityTypeId" = conflicts."targetId"
FROM conflicts
WHERE "TimeEntry"."activityTypeId" = conflicts."sourceId";

WITH renamed_activity_types("fromName", "toName", "toColor", "toIcon") AS (
  VALUES
    ('做饭', '家务', '#F97316', 'home')
), conflicts AS (
  SELECT source."id" AS "sourceId", target."id" AS "targetId"
  FROM "ActivityType" source
  JOIN renamed_activity_types renamed ON source."name" = renamed."fromName"
  JOIN "ActivityType" target
    ON target."userId" = source."userId"
   AND target."name" = renamed."toName"
)
DELETE FROM "TimeEntryActivity"
USING conflicts
WHERE "TimeEntryActivity"."activityTypeId" = conflicts."sourceId"
  AND EXISTS (
    SELECT 1
    FROM "TimeEntryActivity" target_activity
    WHERE target_activity."timeEntryId" = "TimeEntryActivity"."timeEntryId"
      AND target_activity."activityTypeId" = conflicts."targetId"
  );

WITH renamed_activity_types("fromName", "toName", "toColor", "toIcon") AS (
  VALUES
    ('做饭', '家务', '#F97316', 'home')
), conflicts AS (
  SELECT source."id" AS "sourceId", target."id" AS "targetId"
  FROM "ActivityType" source
  JOIN renamed_activity_types renamed ON source."name" = renamed."fromName"
  JOIN "ActivityType" target
    ON target."userId" = source."userId"
   AND target."name" = renamed."toName"
)
UPDATE "TimeEntryActivity"
SET "activityTypeId" = conflicts."targetId"
FROM conflicts
WHERE "TimeEntryActivity"."activityTypeId" = conflicts."sourceId";

WITH renamed_activity_types("fromName", "toName", "toColor", "toIcon") AS (
  VALUES
    ('做饭', '家务', '#F97316', 'home')
), conflicts AS (
  SELECT source."id" AS "sourceId"
  FROM "ActivityType" source
  JOIN renamed_activity_types renamed ON source."name" = renamed."fromName"
  JOIN "ActivityType" target
    ON target."userId" = source."userId"
   AND target."name" = renamed."toName"
)
DELETE FROM "ActivityType"
USING conflicts
WHERE "ActivityType"."id" = conflicts."sourceId";

WITH renamed_activity_types("fromName", "toName", "toColor", "toIcon") AS (
  VALUES
    ('做饭', '家务', '#F97316', 'home')
)
UPDATE "ActivityType"
SET
  "name" = renamed_activity_types."toName",
  "color" = renamed_activity_types."toColor",
  "icon" = renamed_activity_types."toIcon"
FROM renamed_activity_types
WHERE "ActivityType"."name" = renamed_activity_types."fromName";

UPDATE "ActivityType"
SET "color" = '#F97316', "icon" = 'home'
WHERE "name" = '家务';