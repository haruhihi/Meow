import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockValuationHistoryReq, IStockValuationHistoryRes } from '@dtos/meow';
import { buildStockValuationHistory, requireOwnedStockSymbol } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json().catch(() => ({}))) as IStockValuationHistoryReq;
    await requireOwnedStockSymbol(uid, body.symbol);
    const result = await buildStockValuationHistory(body.symbol);

    return success<IStockValuationHistoryRes>(result);
  } catch (error) {
    return fail(error);
  }
}