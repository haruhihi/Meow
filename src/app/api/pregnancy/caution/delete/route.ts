import type { IPregnancyCautionDeleteReq, IPregnancyCautionDeleteRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getUID } from '@libs/session';

export async function POST(req: Request) {
  try {
    const userId = await getUID();
    if (!userId) throw new Error('unauthorized');

    const body = (await req.json()) as IPregnancyCautionDeleteReq;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('事项 ID 无效');
    const existing = await prisma.pregnancyCaution.findFirst({ where: { id, userId } });
    if (!existing) throw new Error('注意事项不存在');

    await prisma.pregnancyCaution.delete({ where: { id } });
    return success<IPregnancyCautionDeleteRes>({ id });
  } catch (error) {
    return fail(error);
  }
}
