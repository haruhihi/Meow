import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockCashUpdateReq, IStockCashUpdateRes } from '@dtos/meow';
import { readNonNegativeNumber, roundStockValue } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockCashUpdateReq;
    const amount = roundStockValue(readNonNegativeNumber(body.amount, 'amount'));

    const cash = await prisma.stockCash.upsert({
      where: { userId: uid },
      create: { userId: uid, amount },
      update: { amount },
    });

    return success<IStockCashUpdateRes>({ amount: cash.amount });
  } catch (error) {
    return fail(error);
  }
}
