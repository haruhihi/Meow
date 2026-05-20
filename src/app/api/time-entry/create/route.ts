import { ITimeEntryCreateReq, ITimeEntryCreateRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getSession } from '@libs/session';

const MAX_ENTRY_MINUTES = 24 * 60;

const validateRange = (startedAt: Date, endedAt: Date) => {
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    throw new Error('invalid time range');
  }
  if (endedAt <= startedAt) {
    throw new Error('endedAt must be after startedAt');
  }
  if (endedAt.getTime() - startedAt.getTime() > MAX_ENTRY_MINUTES * 60 * 1000) {
    throw new Error('time entry cannot exceed 24 hours');
  }
};

export async function POST(req: Request) {
  try {
    const { activityTypeId, startedAt, endedAt, note } = (await req.json()) as ITimeEntryCreateReq;
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);
    if (!activityTypeId) throw new Error('activityTypeId is required');

    const startDate = new Date(startedAt);
    const endDate = new Date(endedAt);
    validateRange(startDate, endDate);

    const activityType = await prisma.activityType.findFirst({
      where: { id: Number(activityTypeId), userId: Number(userId) },
    });
    if (!activityType) throw new Error('activity type not found');

    const timeEntry = await prisma.timeEntry.create({
      data: {
        userId: Number(userId),
        activityTypeId: activityType.id,
        startedAt: startDate,
        endedAt: endDate,
        note,
      },
    });

    return success<ITimeEntryCreateRes>({ timeEntry });
  } catch (error) {
    return fail(error);
  }
}
