WITH renamed_activity_types("fromName", "toName", "toColor", "toIcon") AS (
  VALUES
    ('短视频', '手机', '#FF3D71', 'phone'),
    ('看电视', '电视', '#38BDF8', 'tv')
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
    ('短视频', '手机', '#FF3D71', 'phone'),
    ('看电视', '电视', '#38BDF8', 'tv')
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
    ('短视频', '手机', '#FF3D71', 'phone'),
    ('看电视', '电视', '#38BDF8', 'tv')
)
UPDATE "ActivityType"
SET
  "name" = renamed_activity_types."toName",
  "color" = renamed_activity_types."toColor",
  "icon" = renamed_activity_types."toIcon"
FROM renamed_activity_types
WHERE "ActivityType"."name" = renamed_activity_types."fromName";

UPDATE "ActivityType"
SET "color" = '#8A93A8', "icon" = 'placeholder', "sortOrder" = -1
WHERE "name" = '占位';

INSERT INTO "ActivityType" ("userId", "name", "color", "icon", "sortOrder", "createdAt", "updatedAt")
SELECT "id", '占位', '#8A93A8', 'placeholder', -1, NOW(), NOW()
FROM "User"
WHERE NOT EXISTS (
  SELECT 1
  FROM "ActivityType"
  WHERE "ActivityType"."userId" = "User"."id"
    AND "ActivityType"."name" = '占位'
);