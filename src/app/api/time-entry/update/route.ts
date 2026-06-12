import { ITimeEntryUpdateReq, ITimeEntryUpdateRes } from '@dtos/meow';
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
    const body = (await req.json()) as ITimeEntryUpdateReq;
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);
    if (!body.id) throw new Error('id is required');

    const current = await prisma.timeEntry.findFirst({
      where: { id: Number(body.id), userId: Number(userId) },
    });
    if (!current) throw new Error('time entry not found');

    const startedAt = body.startedAt == null ? current.startedAt : new Date(body.startedAt);
    const endedAt = body.endedAt == null ? current.endedAt : new Date(body.endedAt);
    validateRange(startedAt, endedAt);

    let activityTypeId = current.activityTypeId;
    const shouldUpdateActivities = body.activityTypeIds !== undefined || body.activityTypeId != null;
    let activityTypeIds: number[] | undefined;
    if (shouldUpdateActivities) {
      activityTypeIds = normalizeActivityTypeIds(body.activityTypeIds, body.activityTypeId);
      if (activityTypeIds.length === 0) throw new Error('activityTypeId is required');

      const activityTypes = await prisma.activityType.findMany({
        where: { id: { in: activityTypeIds }, userId: Number(userId) },
      });
      if (activityTypes.length !== activityTypeIds.length) throw new Error('activity type not found');
      activityTypeId = activityTypeIds[0];
    }

    const timeEntry = await prisma.$transaction(async (tx) => {
      const updated = await tx.timeEntry.update({
        where: { id: current.id },
        data: {
          activityTypeId,
          startedAt,
          endedAt,
          note: body.note,
        },
      });

      if (activityTypeIds) {
        await tx.timeEntryActivity.deleteMany({ where: { timeEntryId: current.id } });
        await tx.timeEntryActivity.createMany({
          data: activityTypeIds.map((id) => ({ timeEntryId: current.id, activityTypeId: id })),
        });
      }

      return updated;
    });

    return success<ITimeEntryUpdateRes>({ timeEntry });
  } catch (error) {
    return fail(error);
  }
}
