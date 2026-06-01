import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockPriceHistoryReq, IStockPriceHistoryRes } from '@dtos/meow';
import { buildStockPriceHistory, normalizeOptionalDate, requireOwnedStockSymbol } from '../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json().catch(() => ({}))) as IStockPriceHistoryReq;
    await requireOwnedStockSymbol(uid, body.symbol);
    const startDate = normalizeOptionalDate(body.startDate);
    const endDate = normalizeOptionalDate(body.endDate);
    const result = await buildStockPriceHistory(body.symbol, startDate, endDate);

    return success<IStockPriceHistoryRes>(result);
  } catch (error) {
    return fail(error);
  }
}