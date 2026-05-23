import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockAccountCreateReq, IStockAccountCreateRes } from '@dtos/meow';
import { normalizeName } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockAccountCreateReq;
    const name = normalizeName(body.name ?? '');
    if (!name) throw new Error('account name is required');

    const maxSortOrder = await prisma.stockAccount.aggregate({
      where: { userId: uid },
      _max: { sortOrder: true },
    });

    const account = await prisma.stockAccount.create({
      data: {
        userId: uid,
        name,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });

    return success<IStockAccountCreateRes>({ account });
  } catch (error) {
    return fail(error);
  }
}
