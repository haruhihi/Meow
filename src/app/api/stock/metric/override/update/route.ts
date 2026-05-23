import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockMetricOverrideUpdateReq, IStockMetricOverrideUpdateRes } from '@dtos/meow';
import { normalizeSymbol, readNonNegativeNumber, roundStockValue } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockMetricOverrideUpdateReq;
    const symbol = normalizeSymbol(body.symbol ?? '');
    if (!symbol) throw new Error('symbol is required');

    const normalizedDividend = body.normalizedDividend == null
      ? null
      : roundStockValue(readNonNegativeNumber(body.normalizedDividend, 'normalizedDividend'));
    const note = body.note?.trim() || null;

    const override = await prisma.stockMetricOverride.upsert({
      where: { userId_symbol: { userId: uid, symbol } },
      create: {
        userId: uid,
        symbol,
        normalizedDividend,
        note,
      },
      update: {
        normalizedDividend,
        note,
      },
    });

    return success<IStockMetricOverrideUpdateRes>({
      symbol: override.symbol,
      normalizedDividend: override.normalizedDividend,
      note: override.note,
    });
  } catch (error) {
    return fail(error);
  }
}
