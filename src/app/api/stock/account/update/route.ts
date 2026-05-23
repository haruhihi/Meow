import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockAccountUpdateReq, IStockAccountUpdateRes } from '@dtos/meow';
import { normalizeName, requireOwnedStockAccount } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockAccountUpdateReq;
    if (!body.id) throw new Error('id is required');
    await requireOwnedStockAccount(uid, body.id);

    const data: { name?: string; sortOrder?: number } = {};
    if (body.name !== undefined) {
      const name = normalizeName(body.name);
      if (!name) throw new Error('account name is required');
      data.name = name;
    }
    if (body.sortOrder !== undefined) {
      if (!Number.isFinite(Number(body.sortOrder))) throw new Error('sortOrder is invalid');
      data.sortOrder = Number(body.sortOrder);
    }
    if (Object.keys(data).length === 0) throw new Error('nothing to update');

    const account = await prisma.stockAccount.update({
      where: { id: body.id },
      data,
    });

    return success<IStockAccountUpdateRes>({ account });
  } catch (error) {
    return fail(error);
  }
}
