import { IActivityTypeListRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getSession } from '@libs/session';
import { TIME_ACTIVITY_COLOR_BY_NAME } from '@styles/theme';

const DEPRECATED_ACTIVITY_NAMES = ['吃饭', '通勤', '其他'];
const PLACEHOLDER_ACTIVITY_NAME = '占位';

const RENAMED_ACTIVITY_TYPES = [
  { from: '短视频', to: '手机', color: TIME_ACTIVITY_COLOR_BY_NAME['手机'], icon: 'phone' },
  { from: '看电视', to: '电视', color: TIME_ACTIVITY_COLOR_BY_NAME['电视'], icon: 'tv' },
];

const DEFAULT_ACTIVITY_TYPES = [
  { name: PLACEHOLDER_ACTIVITY_NAME, color: TIME_ACTIVITY_COLOR_BY_NAME[PLACEHOLDER_ACTIVITY_NAME], icon: 'placeholder' },
  { name: '睡眠', color: TIME_ACTIVITY_COLOR_BY_NAME['睡眠'], icon: 'moon' },
  { name: '工作', color: TIME_ACTIVITY_COLOR_BY_NAME['工作'], icon: 'work' },
  { name: '手机', color: TIME_ACTIVITY_COLOR_BY_NAME['手机'], icon: 'phone' },
  { name: '电视', color: TIME_ACTIVITY_COLOR_BY_NAME['电视'], icon: 'tv' },
  { name: '钢琴', color: TIME_ACTIVITY_COLOR_BY_NAME['钢琴'], icon: 'piano' },
  { name: '运动', color: TIME_ACTIVITY_COLOR_BY_NAME['运动'], icon: 'sport' },
  { name: '阅读', color: TIME_ACTIVITY_COLOR_BY_NAME['阅读'], icon: 'book' },
  { name: '学习', color: TIME_ACTIVITY_COLOR_BY_NAME['学习'], icon: 'study' },
];

const updateActivityTypeDefaults = async (
  activityType: { id: number; color: string; icon: string | null },
  defaults: { color: string; icon: string },
) => {
  if (activityType.color === defaults.color && activityType.icon === defaults.icon) return;

  await prisma.activityType.update({
    where: { id: activityType.id },
    data: defaults,
  });
};

const normalizeRenamedActivityTypes = async (userId: number) => {
  for (const activityType of RENAMED_ACTIVITY_TYPES) {
    const source = await prisma.activityType.findFirst({
      where: { userId, name: activityType.from },
    });
    const target = await prisma.activityType.findFirst({
      where: { userId, name: activityType.to },
    });

    if (!source) {
      if (target) {
        await updateActivityTypeDefaults(target, { color: activityType.color, icon: activityType.icon });
      }
      continue;
    }

    if (target) {
      await prisma.timeEntry.updateMany({
        where: { userId, activityTypeId: source.id },
        data: { activityTypeId: target.id },
      });
      await prisma.activityType.delete({ where: { id: source.id } });
      await updateActivityTypeDefaults(target, { color: activityType.color, icon: activityType.icon });
      continue;
    }

    await prisma.activityType.update({
      where: { id: source.id },
      data: {
        name: activityType.to,
        color: activityType.color,
        icon: activityType.icon,
      },
    });
  }
};

const ensurePlaceholderActivityType = async (userId: number) => {
  const placeholderActivityType = await prisma.activityType.findFirst({
    where: { userId, name: PLACEHOLDER_ACTIVITY_NAME },
  });

  if (placeholderActivityType) {
    if (
      placeholderActivityType.color === TIME_ACTIVITY_COLOR_BY_NAME[PLACEHOLDER_ACTIVITY_NAME]
      && placeholderActivityType.icon === 'placeholder'
      && placeholderActivityType.sortOrder === -1
    ) {
      return;
    }

    await prisma.activityType.update({
      where: { id: placeholderActivityType.id },
      data: {
        color: TIME_ACTIVITY_COLOR_BY_NAME[PLACEHOLDER_ACTIVITY_NAME],
        icon: 'placeholder',
        sortOrder: -1,
      },
    });
    return;
  }

  await prisma.activityType.create({
    data: {
      userId,
      name: PLACEHOLDER_ACTIVITY_NAME,
      color: TIME_ACTIVITY_COLOR_BY_NAME[PLACEHOLDER_ACTIVITY_NAME],
      icon: 'placeholder',
      sortOrder: -1,
    },
  });
};

export async function POST() {
  try {
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);
    const userIdNumber = Number(userId);

    const existingCount = await prisma.activityType.count({ where: { userId: userIdNumber } });
    if (existingCount === 0) {
      await prisma.activityType.createMany({
        data: DEFAULT_ACTIVITY_TYPES.map((activityType, index) => ({
          ...activityType,
          userId: userIdNumber,
          sortOrder: index,
        })),
        skipDuplicates: true,
      });
    }

    await normalizeRenamedActivityTypes(userIdNumber);
    await ensurePlaceholderActivityType(userIdNumber);

    const activityTypes = await prisma.activityType.findMany({
      where: {
        userId: userIdNumber,
        name: { notIn: DEPRECATED_ACTIVITY_NAMES },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    return success<IActivityTypeListRes>({ activityTypes });
  } catch (error) {
    return fail(error);
  }
}
