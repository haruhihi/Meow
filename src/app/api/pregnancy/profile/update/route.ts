import type { IPregnancyProfileUpdateReq, IPregnancyProfileUpdateRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getUID } from '@libs/session';
import { normalizePregnancyDate } from '@utils/pregnancy';
import { getTodayForTimezone, pregnancyProfileToItem } from '../../helpers';

export async function POST(req: Request) {
  try {
    const userId = await getUID();
    if (!userId) throw new Error('unauthorized');

    const body = (await req.json()) as IPregnancyProfileUpdateReq;
    const startDate = normalizePregnancyDate(body.startDate, '末次月经日期');
    if (startDate > getTodayForTimezone(body.timezoneOffsetMinutes)) {
      throw new Error('末次月经日期不能晚于今天');
    }

    const profile = await prisma.pregnancyProfile.upsert({
      where: { userId },
      create: { userId, startDate },
      update: { startDate },
    });

    return success<IPregnancyProfileUpdateRes>({ profile: pregnancyProfileToItem(profile) });
  } catch (error) {
    return fail(error);
  }
}
