import { prisma } from '@libs/prisma';
import { ITrekCreateReq, ITrekDeleteRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';

export async function POST(request: Request) {
  try {
    const { date, type } = (await request.json()) as ITrekCreateReq;
    const userId = await getUID();

    if (!date || !userId || !type) {
      throw new Error(`非法的 params, date: ${date}, userId: ${userId}, type: ${type}`);
    }

    await prisma.trek.deleteMany({
      where: {
        date: new Date(date),
        type,
      },
    });


    return success<ITrekDeleteRes>({ treks: [] });
  } catch (error) {
    return fail(error);
  }
}
