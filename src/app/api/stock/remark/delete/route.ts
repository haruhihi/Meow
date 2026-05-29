import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockRemarkDeleteReq, IStockRemarkDeleteRes } from '@dtos/meow';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockRemarkDeleteReq;
    if (!body.id) throw new Error('id is required');

    const existing = await prisma.stockRemark.findFirst({
      where: { id: body.id, userId: uid },
    });
    if (!existing) throw new Error('remark not found');

    await prisma.stockRemark.delete({ where: { id: body.id } });

    return success<IStockRemarkDeleteRes>({ id: body.id });
  } catch (error) {
    return fail(error);
  }
}