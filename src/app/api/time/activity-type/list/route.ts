import { IActivityTypeListRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getSession } from '@libs/session';
import { TIME_ACTIVITY_COLOR_BY_NAME } from '@styles/theme';

const DEPRECATED_ACTIVITY_NAMES = ['吃饭', '通勤', '其他'];

const DEFAULT_ACTIVITY_TYPES = [
  { name: '睡眠', color: TIME_ACTIVITY_COLOR_BY_NAME['睡眠'], icon: 'moon' },
  { name: '工作', color: TIME_ACTIVITY_COLOR_BY_NAME['工作'], icon: 'work' },
  { name: '短视频', color: TIME_ACTIVITY_COLOR_BY_NAME['短视频'], icon: 'video' },
  { name: '钢琴', color: TIME_ACTIVITY_COLOR_BY_NAME['钢琴'], icon: 'piano' },
  { name: '运动', color: TIME_ACTIVITY_COLOR_BY_NAME['运动'], icon: 'sport' },
  { name: '阅读', color: TIME_ACTIVITY_COLOR_BY_NAME['阅读'], icon: 'book' },
  { name: '学习', color: TIME_ACTIVITY_COLOR_BY_NAME['学习'], icon: 'study' },
];

export async function POST() {
  try {
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);

    const existingCount = await prisma.activityType.count({ where: { userId: Number(userId) } });
    if (existingCount === 0) {
      await prisma.activityType.createMany({
        data: DEFAULT_ACTIVITY_TYPES.map((activityType, index) => ({
          ...activityType,
          userId: Number(userId),
          sortOrder: index,
        })),
        skipDuplicates: true,
      });
    }

    const activityTypes = await prisma.activityType.findMany({
      where: {
        userId: Number(userId),
        name: { notIn: DEPRECATED_ACTIVITY_NAMES },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    return success<IActivityTypeListRes>({ activityTypes });
  } catch (error) {
    return fail(error);
  }
}
