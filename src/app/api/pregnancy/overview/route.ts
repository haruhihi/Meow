import type { IPregnancyOverviewRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getUID } from '@libs/session';
import {
  ensurePregnancyProfile,
  getPregnancyBounds,
  pregnancyCautionToItem,
  pregnancyProfileToItem,
  pregnancyRecordToItem,
} from '../helpers';

export async function POST() {
  try {
    const userId = await getUID();
    if (!userId) throw new Error('unauthorized');

    const profile = await ensurePregnancyProfile(userId);
    const bounds = getPregnancyBounds(profile.startDate);
    const [cautions, records] = await Promise.all([
      prisma.pregnancyCaution.findMany({
        where: {
          userId,
          startDate: { lte: bounds.endDate },
          endDate: { gte: bounds.startDate },
        },
        orderBy: [{ startDate: 'asc' }, { endDate: 'asc' }, { id: 'asc' }],
      }),
      prisma.pregnancyDailyRecord.findMany({
        where: {
          userId,
          recordDate: { gte: bounds.startDate, lte: bounds.endDate },
        },
        orderBy: [{ recordDate: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return success<IPregnancyOverviewRes>({
      profile: pregnancyProfileToItem(profile),
      cautions: cautions.map(pregnancyCautionToItem),
      records: records.map(pregnancyRecordToItem),
    });
  } catch (error) {
    return fail(error);
  }
}
