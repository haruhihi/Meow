import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockAccountDeleteReq } from '@dtos/meow';
import { requireOwnedStockAccount } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockAccountDeleteReq;
    if (!body.id) throw new Error('id is required');
    await requireOwnedStockAccount(uid, body.id);

    const holdingCount = await prisma.stockHolding.count({
      where: { userId: uid, accountId: body.id },
    });
    if (holdingCount > 0) throw new Error('account has holdings');

    await prisma.stockAccount.delete({ where: { id: body.id } });

    return success({ id: body.id });
  } catch (error) {
    return fail(error);
  }
}
