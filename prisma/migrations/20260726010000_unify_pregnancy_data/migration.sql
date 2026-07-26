WITH duplicate_records AS (
  SELECT "id"
  FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "recordDate"
        ORDER BY "updatedAt" DESC, "id" DESC
      ) AS row_number
    FROM "PregnancyDailyRecord"
  ) ranked_records
  WHERE ranked_records.row_number > 1
)
DELETE FROM "PregnancyDailyRecord"
USING duplicate_records
WHERE "PregnancyDailyRecord"."id" = duplicate_records."id";

WITH shared_profile AS (
  SELECT "id", "userId"
  FROM "PregnancyProfile"
  ORDER BY "id" ASC
  LIMIT 1
)
UPDATE "PregnancyDailyRecord"
SET "userId" = shared_profile."userId"
FROM shared_profile
WHERE "PregnancyDailyRecord"."userId" <> shared_profile."userId";

WITH shared_profile AS (
  SELECT "id", "userId"
  FROM "PregnancyProfile"
  ORDER BY "id" ASC
  LIMIT 1
)
UPDATE "PregnancyCaution"
SET "userId" = shared_profile."userId"
FROM shared_profile
WHERE "PregnancyCaution"."userId" <> shared_profile."userId";

WITH shared_profile AS (
  SELECT "id"
  FROM "PregnancyProfile"
  ORDER BY "id" ASC
  LIMIT 1
)
DELETE FROM "PregnancyProfile"
USING shared_profile
WHERE "PregnancyProfile"."id" <> shared_profile."id";