import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockHoldingUpdateReq, IStockHoldingUpdateRes } from '@dtos/meow';
import { normalizeName, normalizeSymbol, readNonNegativeNumber, requireOwnedStockAccount } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockHoldingUpdateReq;
    if (!body.id) throw new Error('id is required');

    const existing = await prisma.stockHolding.findFirst({
      where: { id: body.id, userId: uid },
    });
    if (!existing) throw new Error('holding not found');

    const data: {
      accountId?: number;
      symbol?: string;
      name?: string;
      quantity?: number;
      currentPrice?: number;
    } = {};

    if (body.accountId !== undefined) {
      await requireOwnedStockAccount(uid, body.accountId);
      data.accountId = body.accountId;
    }
    if (body.symbol !== undefined) {
      const symbol = normalizeSymbol(body.symbol);
      if (!symbol) throw new Error('symbol is required');
      data.symbol = symbol;
    }
    if (body.name !== undefined) {
      const name = normalizeName(body.name);
      if (!name) throw new Error('name is required');
      data.name = name;
    }
    if (body.quantity !== undefined) {
      data.quantity = readNonNegativeNumber(body.quantity, 'quantity');
    }
    if (body.currentPrice !== undefined) {
      data.currentPrice = readNonNegativeNumber(body.currentPrice, 'currentPrice');
    }
    if (Object.keys(data).length === 0) throw new Error('nothing to update');

    const holding = await prisma.stockHolding.update({
      where: { id: body.id },
      data,
    });

    return success<IStockHoldingUpdateRes>({ holding });
  } catch (error) {
    return fail(error);
  }
}
