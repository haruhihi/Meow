import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockHoldingDeleteReq } from '@dtos/meow';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockHoldingDeleteReq;
    if (!body.id) throw new Error('id is required');

    const existing = await prisma.stockHolding.findFirst({
      where: { id: body.id, userId: uid },
    });
    if (!existing) throw new Error('holding not found');

    await prisma.stockHolding.delete({ where: { id: body.id } });

    return success({ id: body.id });
  } catch (error) {
    return fail(error);
  }
}
