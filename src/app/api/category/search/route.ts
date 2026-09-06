import { prisma } from '@libs/prisma';
import { ICategoryRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';

export async function POST() {
  try {
    const userId = await getUID();
    if (!userId) throw new Error('unauthorized');

    const [categories, usage] = await Promise.all([
      prisma.category.findMany({
        include: {
          parent: true,
          children: true,
        },
      }),
      prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { userId },
        _count: { _all: true },
      }),
    ]);
    const usageByCategoryId = new Map(usage.map((item) => [item.categoryId, item._count._all]));

    return success<ICategoryRes>({
      categories: categories.map((category) => ({
        ...category,
        usageCount: usageByCategoryId.get(category.id) ?? 0,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}
