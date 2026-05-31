import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockSearchReq, IStockSearchRes } from '@dtos/meow';
import { buildStockPortfolio } from '../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json().catch(() => ({}))) as IStockSearchReq;
    const portfolio = await buildStockPortfolio(uid, body.keyword, body.detailSymbol);

    return success<IStockSearchRes>(portfolio);
  } catch (error) {
    return fail(error);
  }
}
