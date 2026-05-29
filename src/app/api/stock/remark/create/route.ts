import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockRemarkCreateReq, IStockRemarkCreateRes } from '@dtos/meow';
import { normalizeRemarkContent, normalizeRemarkDate, normalizeSymbol, requireOwnedStockSymbol, stockRemarkToListItem } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockRemarkCreateReq;
    const symbol = normalizeSymbol(body.symbol ?? '');
    if (!symbol) throw new Error('symbol is required');

    await requireOwnedStockSymbol(uid, symbol);
    const remarkDate = normalizeRemarkDate(body.remarkDate);
    const content = normalizeRemarkContent(body.content);

    const remark = await prisma.stockRemark.upsert({
      where: { userId_symbol_remarkDate: { userId: uid, symbol, remarkDate } },
      create: { userId: uid, symbol, remarkDate, content },
      update: { content },
    });

    return success<IStockRemarkCreateRes>({ remark: stockRemarkToListItem(remark) });
  } catch (error) {
    return fail(error);
  }
}