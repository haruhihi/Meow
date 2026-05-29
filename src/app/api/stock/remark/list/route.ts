import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockRemarkListReq, IStockRemarkListRes } from '@dtos/meow';
import { normalizeSymbol, requireOwnedStockSymbol, stockRemarkToListItem } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockRemarkListReq;
    const symbol = normalizeSymbol(body.symbol ?? '');
    if (!symbol) throw new Error('symbol is required');

    const quote = await requireOwnedStockSymbol(uid, symbol);
    const remarks = await prisma.stockRemark.findMany({
      where: { userId: uid, symbol },
      orderBy: [{ remarkDate: 'desc' }, { updatedAt: 'desc' }],
    });

    return success<IStockRemarkListRes>({
      symbol,
      name: quote.name,
      remarks: remarks.map(stockRemarkToListItem),
    });
  } catch (error) {
    return fail(error);
  }
}