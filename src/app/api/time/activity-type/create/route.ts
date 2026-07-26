import { IActivityTypeCreateReq, IActivityTypeCreateRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getSession } from '@libs/session';
import { TIME_ACTIVITY_COLORS } from '@styles/theme';

const normalizeActivityName = (name?: string) => {
  const trimmedName = name?.trim();
  return trimmedName === '做饭' ? '家务' : trimmedName;
};

const pickActivityColor = (usedColors: string[]) => {
  const used = new Set(usedColors.map((color) => color.toUpperCase()));
  return TIME_ACTIVITY_COLORS.find((color) => !used.has(color.toUpperCase()))
    ?? TIME_ACTIVITY_COLORS[usedColors.length % TIME_ACTIVITY_COLORS.length];
};

export async function POST(req: Request) {
  try {
    const { name } = (await req.json()) as IActivityTypeCreateReq;
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);

    const trimmedName = normalizeActivityName(name);
    if (!trimmedName) throw new Error('name is required');
    if (trimmedName.length > 20) throw new Error('name is too long');

    const existing = await prisma.activityType.findFirst({
      where: {
        userId: Number(userId),
        name: trimmedName,
      },
    });
    if (existing) return success<IActivityTypeCreateRes>({ activityType: existing });

    const existingActivityTypes = await prisma.activityType.findMany({
      where: { userId: Number(userId) },
      select: { color: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const activityType = await prisma.activityType.create({
      data: {
        userId: Number(userId),
        name: trimmedName,
        color: pickActivityColor(existingActivityTypes.map((activityType) => activityType.color)),
        icon: 'custom',
        sortOrder: existingActivityTypes.length,
      },
    });

    return success<IActivityTypeCreateRes>({ activityType });
  } catch (error) {
    return fail(error);
  }
}
