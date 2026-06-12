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

const normalizeActivityTypeIds = (activityTypeIds?: number[], activityTypeId?: number) => {
  const ids = activityTypeIds && activityTypeIds.length > 0 ? activityTypeIds : activityTypeId != null ? [activityTypeId] : [];
  return [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
};

export async function POST(req: Request) {
  try {
    const { activityTypeId, activityTypeIds: rawActivityTypeIds, startedAt, endedAt, note } = (await req.json()) as ITimeEntryCreateReq;
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);
    const activityTypeIds = normalizeActivityTypeIds(rawActivityTypeIds, activityTypeId);
    if (activityTypeIds.length === 0) throw new Error('activityTypeId is required');

    const startDate = new Date(startedAt);
    const endDate = new Date(endedAt);
    validateRange(startDate, endDate);

    const activityTypes = await prisma.activityType.findMany({
      where: { id: { in: activityTypeIds }, userId: Number(userId) },
    });
    if (activityTypes.length !== activityTypeIds.length) throw new Error('activity type not found');

    const timeEntry = await prisma.timeEntry.create({
      data: {
        userId: Number(userId),
        activityTypeId: activityTypeIds[0],
        startedAt: startDate,
        endedAt: endDate,
        note,
        activities: {
          create: activityTypeIds.map((id) => ({ activityTypeId: id })),
        },
      },
    });

    return success<ITimeEntryCreateRes>({ timeEntry });
  } catch (error) {
    return fail(error);
  }
}
