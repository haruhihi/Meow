import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockDividendListReq, IStockDividendListRes, StockDividendEventWithMarking } from '@dtos/meow';
import { dividendEventDedupeKey, normalizeSymbol } from '../../helpers';
import { getStockUniverseItem } from '../../../../../config/stock-universe';

const isImplementedDividend = (event: { status: string | null; description: string | null; exDividendDate: Date | null }) =>
  Boolean(event.exDividendDate) || /实施/.test(event.status ?? event.description ?? '');

const preferDividendEvent = (left: StockDividendEventWithMarking, right: StockDividendEventWithMarking) => {
  const leftMarked = Boolean(left.marking?.countTowardNormalizedDividend);
  const rightMarked = Boolean(right.marking?.countTowardNormalizedDividend);
  const leftImplemented = isImplementedDividend(left);
  const rightImplemented = isImplementedDividend(right);
  if (leftImplemented !== rightImplemented) return leftImplemented ? left : right;
  if (leftMarked !== rightMarked) return leftMarked ? left : right;
  const leftTime = (left.exDividendDate ?? left.announcementDate)?.getTime() ?? 0;
  const rightTime = (right.exDividendDate ?? right.announcementDate)?.getTime() ?? 0;
  return leftTime >= rightTime ? left : right;
};

const dedupeDividendEvents = (events: StockDividendEventWithMarking[]): StockDividendEventWithMarking[] => {
  const byKey = new Map<string, StockDividendEventWithMarking>();
  events.forEach((event) => {
    const key = dividendEventDedupeKey(event);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, event);
      return;
    }

    const preferred = preferDividendEvent(existing, event);
    const mergedMarking = existing.marking?.countTowardNormalizedDividend || event.marking?.countTowardNormalizedDividend
      ? {
          countTowardNormalizedDividend: Boolean(existing.marking?.countTowardNormalizedDividend || event.marking?.countTowardNormalizedDividend),
          note: existing.marking?.note ?? event.marking?.note ?? null,
        }
      : existing.marking ?? event.marking;
    byKey.set(key, { ...preferred, marking: mergedMarking });
  });
  return [...byKey.values()];
};

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
    const symbols = requestedSymbol
      ? heldSymbols.length > 0 || getStockUniverseItem(requestedSymbol)
        ? [requestedSymbol]
        : []
      : heldSymbols.map((holding) => holding.symbol);

    if (symbols.length === 0) {
      return success<IStockDividendListRes>({ events: [] });
    }

    const since = new Date();
    since.setFullYear(since.getFullYear() - 2);

    const events = await prisma.stockDividendEvent.findMany({
      where: {
        symbol: { in: symbols },
        ...(requestedSymbol
          ? {}
          : {
              OR: [
                { exDividendDate: { gte: since } },
                { exDividendDate: null, announcementDate: { gte: since } },
              ],
            }),
      },
      include: {
        markings: {
          where: { userId: uid },
          select: { countTowardNormalizedDividend: true, note: true },
        },
      },
      orderBy: [{ exDividendDate: 'desc' }, { announcementDate: 'desc' }, { id: 'desc' }],
    });

    const sortedEvents = events.sort((left, right) => {
      const leftTime = (left.exDividendDate ?? left.announcementDate)?.getTime() ?? 0;
      const rightTime = (right.exDividendDate ?? right.announcementDate)?.getTime() ?? 0;
      return rightTime - leftTime || right.id - left.id;
    });

    const normalizedEvents = sortedEvents.map((event): StockDividendEventWithMarking => {
        const { markings, ...rest } = event;
        return {
          ...rest,
          marking: markings[0] ?? null,
        };
      });

    return success<IStockDividendListRes>({
      events: dedupeDividendEvents(normalizedEvents),
    });
  } catch (error) {
    return fail(error);
  }
}
