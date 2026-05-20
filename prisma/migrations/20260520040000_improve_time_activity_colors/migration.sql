-- Improve contrast for built-in time activity colors and recolor custom activities
-- so they do not inherit the generic chart palette.
UPDATE "ActivityType"
SET "color" = CASE "name"
  WHEN '睡眠' THEN '#6D5DF6'
  WHEN '工作' THEN '#008FF5'
  WHEN '短视频' THEN '#FF3D71'
  WHEN '钢琴' THEN '#9C27B0'
  WHEN '运动' THEN '#00B86B'
  WHEN '阅读' THEN '#FF8A00'
  WHEN '学习' THEN '#00A7A7'
  ELSE "color"
END
WHERE "name" IN ('睡眠', '工作', '短视频', '钢琴', '运动', '阅读', '学习');

WITH custom_colors AS (
  SELECT
    "id",
    (ARRAY[
      '#FFD400', '#00C2FF', '#7ED957', '#FF6B35', '#B15CFF', '#00D1B2', '#FF7AB6',
      '#3D7DFF', '#C6D500', '#8E7CFF', '#FFB000', '#20C997', '#F72585'
    ])[(((ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "sortOrder", "id") - 1) % 13) + 1)::int] AS "nextColor"
  FROM "ActivityType"
  WHERE "name" NOT IN ('睡眠', '工作', '短视频', '钢琴', '运动', '阅读', '学习', '吃饭', '通勤', '其他')
)
UPDATE "ActivityType"
SET "color" = custom_colors."nextColor"
FROM custom_colors
WHERE "ActivityType"."id" = custom_colors."id";
