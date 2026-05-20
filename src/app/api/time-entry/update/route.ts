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
    if (body.activityTypeId != null) {
      const activityType = await prisma.activityType.findFirst({
        where: { id: Number(body.activityTypeId), userId: Number(userId) },
      });
      if (!activityType) throw new Error('activity type not found');
      activityTypeId = activityType.id;
    }

    const timeEntry = await prisma.timeEntry.update({
      where: { id: current.id },
      data: {
        activityTypeId,
        startedAt,
        endedAt,
        note: body.note,
      },
    });

    return success<ITimeEntryUpdateRes>({ timeEntry });
  } catch (error) {
    return fail(error);
  }
}
