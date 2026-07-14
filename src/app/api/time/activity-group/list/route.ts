import { ITimeActivityGroupListRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getSession } from '@libs/session';

export async function POST() {
  try {
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);

    const groups = await prisma.timeActivityGroup.findMany({
      where: { userId: Number(userId) },
      include: {
        activityTypes: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    return success<ITimeActivityGroupListRes>({ groups });
  } catch (error) {
    return fail(error);
  }
}
