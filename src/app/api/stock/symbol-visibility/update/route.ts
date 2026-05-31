import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockSymbolVisibilityUpdateReq, IStockSymbolVisibilityUpdateRes } from '@dtos/meow';
import { normalizeSymbol, requireOwnedStockSymbol } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockSymbolVisibilityUpdateReq;
    const symbol = normalizeSymbol(body.symbol ?? '');
    if (!symbol) throw new Error('symbol is required');
    await requireOwnedStockSymbol(uid, symbol);

    const isHidden = Boolean(body.isHidden);
    if (isHidden) {
      await prisma.stockSymbolPreference.upsert({
        where: { userId_symbol: { userId: uid, symbol } },
        create: { userId: uid, symbol, isHidden: true },
        update: { isHidden: true },
      });
    } else {
      await prisma.stockSymbolPreference.deleteMany({
        where: { userId: uid, symbol },
      });
    }

    return success<IStockSymbolVisibilityUpdateRes>({ symbol, isHidden });
  } catch (error) {
    return fail(error);
  }
}