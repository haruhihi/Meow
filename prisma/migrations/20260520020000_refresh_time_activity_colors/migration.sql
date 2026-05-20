-- Refresh colors for built-in time activity types.
-- Custom user-created activity types are left untouched.
UPDATE "ActivityType"
SET "color" = CASE "name"
  WHEN '睡眠' THEN '#6366F1'
  WHEN '工作' THEN '#0EA5E9'
  WHEN '短视频' THEN '#F43F5E'
  WHEN '钢琴' THEN '#A855F7'
  WHEN '运动' THEN '#22C55E'
  WHEN '阅读' THEN '#F97316'
  WHEN '学习' THEN '#14B8A6'
  WHEN '其他' THEN '#64748B'
  ELSE "color"
END
WHERE "name" IN ('睡眠', '工作', '短视频', '钢琴', '运动', '阅读', '学习', '其他');
