import type { IPregnancyRecordUpsertReq, IPregnancyRecordUpsertRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getUID } from '@libs/session';
import { normalizePregnancyDate } from '@utils/pregnancy';
import { ensurePregnancyProfile, normalizePregnancyContent, pregnancyRecordToItem } from '../../helpers';

export async function POST(req: Request) {
  try {
    const userId = await getUID();
    if (!userId) throw new Error('unauthorized');

    const body = (await req.json()) as IPregnancyRecordUpsertReq;
    const recordDate = normalizePregnancyDate(body.recordDate, '记录日期');
    const content = normalizePregnancyContent(body.content, '个人记录');
    const existing = await prisma.pregnancyDailyRecord.findFirst({
      where: { userId, recordDate },
      orderBy: [{ id: 'asc' }],
    });
    const record = existing
      ? await prisma.pregnancyDailyRecord.update({ where: { id: existing.id }, data: { content } })
      : await prisma.pregnancyDailyRecord.create({
        data: { userId: (await ensurePregnancyProfile(userId)).userId, recordDate, content },
      });

    return success<IPregnancyRecordUpsertRes>({ record: pregnancyRecordToItem(record) });
  } catch (error) {
    return fail(error);
  }
}
