import { TIME_ACTIVITY_GROUP_COLOR_BY_NAME } from '@styles/theme';

export const PLACEHOLDER_ACTIVITY_NAME = '占位';

export const DEFAULT_TIME_ACTIVITY_GROUPS = [
  {
    name: '屏幕',
    color: TIME_ACTIVITY_GROUP_COLOR_BY_NAME['屏幕'],
    targetMinutes: 120,
    targetDirection: 'AT_MOST',
    activityNames: ['手机', '电视'],
  },
  {
    name: '休息',
    color: TIME_ACTIVITY_GROUP_COLOR_BY_NAME['休息'],
    targetMinutes: 480,
    targetDirection: 'AT_LEAST',
    activityNames: ['睡眠', '闭目'],
  },
  {
    name: '运动',
    color: TIME_ACTIVITY_GROUP_COLOR_BY_NAME['运动'],
    targetMinutes: 30,
    targetDirection: 'AT_LEAST',
    activityNames: ['运动', '步行'],
  },
  {
    name: '学习',
    color: TIME_ACTIVITY_GROUP_COLOR_BY_NAME['学习'],
    targetMinutes: 60,
    targetDirection: 'AT_LEAST',
    activityNames: ['学习', '阅读'],
  },
] as const;

export const getDefaultTimeEntryActivityTypeIds = (activityTypes: { id: number; name: string }[]) => {
  const placeholderActivityType = activityTypes.find((activityType) => activityType.name === PLACEHOLDER_ACTIVITY_NAME);
  const defaultActivityType = placeholderActivityType ?? activityTypes[0];
  return defaultActivityType ? [String(defaultActivityType.id)] : undefined;
};