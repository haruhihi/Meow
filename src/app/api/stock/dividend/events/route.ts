import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockDividendListReq, IStockDividendListRes, StockDividendEventWithMarking } from '@dtos/meow';
import { normalizeSymbol } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json().catch(() => ({}))) as IStockDividendListReq;
    const requestedSymbol = body.symbol ? normalizeSymbol(body.symbol) : null;
    const heldSymbols = await prisma.stockHolding.findMany({
      where: { userId: uid, ...(requestedSymbol ? { symbol: requestedSymbol } : {}) },
      distinct: ['symbol'],
      select: { symbol: true },
    });
    const symbols = heldSymbols.map((holding) => holding.symbol);

    if (symbols.length === 0) {
      return success<IStockDividendListRes>({ events: [] });
    }

    const since = new Date();
    since.setFullYear(since.getFullYear() - 2);

    const events = await prisma.stockDividendEvent.findMany({
      where: {
        symbol: { in: symbols },
        OR: [
          { exDividendDate: { gte: since } },
          { exDividendDate: null, announcementDate: { gte: since } },
        ],
      },
      include: {
        markings: {
          where: { userId: uid },
          select: { countTowardNormalizedDividend: true, note: true },
        },
      },
      orderBy: [{ exDividendDate: 'desc' }, { announcementDate: 'desc' }, { id: 'desc' }],
    });

    return success<IStockDividendListRes>({
      events: events.map((event): StockDividendEventWithMarking => {
        const { markings, ...rest } = event;
        return {
          ...rest,
          marking: markings[0] ?? null,
        };
      }),
    });
  } catch (error) {
    return fail(error);
  }
}
