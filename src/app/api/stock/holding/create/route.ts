import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockHoldingCreateReq, IStockHoldingCreateRes } from '@dtos/meow';
import { normalizeName, normalizeSymbol, readNonNegativeNumber, requireOwnedStockAccount } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockHoldingCreateReq;
    if (!body.accountId) throw new Error('accountId is required');
    await requireOwnedStockAccount(uid, body.accountId);

    const symbol = normalizeSymbol(body.symbol ?? '');
    const name = normalizeName(body.name ?? '');
    const quantity = readNonNegativeNumber(body.quantity, 'quantity');
    const currentPrice = readNonNegativeNumber(body.currentPrice, 'currentPrice');
    if (!symbol) throw new Error('symbol is required');
    if (!name) throw new Error('name is required');

    const holding = await prisma.$transaction(async (tx) => {
      await tx.stockQuote.upsert({
        where: { userId_symbol: { userId: uid, symbol } },
        create: {
          userId: uid,
          symbol,
          name,
          currentPrice,
        },
        update: {
          name,
          currentPrice,
        },
      });

      return tx.stockHolding.create({
        data: {
          userId: uid,
          accountId: body.accountId,
          symbol,
          quantity,
        },
      });
    });

    return success<IStockHoldingCreateRes>({ holding });
  } catch (error) {
    return fail(error);
  }
}
