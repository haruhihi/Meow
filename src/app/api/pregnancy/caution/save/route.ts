import type { IPregnancyCautionSaveReq, IPregnancyCautionSaveRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getUID } from '@libs/session';
import {
  ensurePregnancyProfile,
  normalizePregnancyContent,
  normalizePregnancyRange,
  pregnancyCautionToItem,
} from '../../helpers';

export async function POST(req: Request) {
  try {
    const userId = await getUID();
    if (!userId) throw new Error('unauthorized');

    const body = (await req.json()) as IPregnancyCautionSaveReq;
    const { startDate, endDate } = normalizePregnancyRange(body.startDate, body.endDate);
    const content = normalizePregnancyContent(body.content, '注意事项');
    const id = body.id == null ? null : Number(body.id);

    let caution;
    if (id != null) {
      if (!Number.isInteger(id) || id <= 0) throw new Error('事项 ID 无效');
      const existing = await prisma.pregnancyCaution.findFirst({ where: { id } });
      if (!existing) throw new Error('注意事项不存在');
      caution = await prisma.pregnancyCaution.update({
        where: { id },
        data: { startDate, endDate, content },
      });
    } else {
      const sharedProfile = await ensurePregnancyProfile(userId);
      caution = await prisma.pregnancyCaution.create({
        data: { userId: sharedProfile.userId, startDate, endDate, content },
      });
    }

    return success<IPregnancyCautionSaveRes>({ caution: pregnancyCautionToItem(caution) });
  } catch (error) {
    return fail(error);
  }
}
