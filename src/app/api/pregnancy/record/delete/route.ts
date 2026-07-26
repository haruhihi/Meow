import type { IPregnancyRecordDeleteReq, IPregnancyRecordDeleteRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getUID } from '@libs/session';

export async function POST(req: Request) {
  try {
    const userId = await getUID();
    if (!userId) throw new Error('unauthorized');

    const body = (await req.json()) as IPregnancyRecordDeleteReq;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('记录 ID 无效');
    const existing = await prisma.pregnancyDailyRecord.findFirst({ where: { id } });
    if (!existing) throw new Error('个人记录不存在');

    await prisma.pregnancyDailyRecord.delete({ where: { id } });
    return success<IPregnancyRecordDeleteRes>({ id });
  } catch (error) {
    return fail(error);
  }
}
