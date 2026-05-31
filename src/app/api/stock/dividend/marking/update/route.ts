import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockDividendMarkingUpdateReq, IStockDividendMarkingUpdateRes } from '@dtos/meow';

const duplicateDividendWhere = (event: {
  symbol: string;
  reportPeriod: string | null;
  bonusSharesPerTen: number | null;
  transferSharesPerTen: number | null;
}) => ({
  symbol: event.symbol,
  reportPeriod: event.reportPeriod,
  bonusSharesPerTen: event.bonusSharesPerTen,
  transferSharesPerTen: event.transferSharesPerTen,
});

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockDividendMarkingUpdateReq;
    if (!body.eventId) throw new Error('eventId is required');

    const event = await prisma.stockDividendEvent.findUnique({
      where: { id: body.eventId },
    });
    if (!event) throw new Error('dividend event not found');

    const duplicateEvents = await prisma.stockDividendEvent.findMany({
      where: duplicateDividendWhere(event),
      select: { id: true },
    });
    const eventIds = duplicateEvents.map((item) => item.id);

    await Promise.all(eventIds.map((eventId) =>
      prisma.stockDividendMarking.upsert({
        where: { userId_eventId: { userId: uid, eventId } },
        create: {
          userId: uid,
          eventId,
          countTowardNormalizedDividend: body.countTowardNormalizedDividend,
          note: body.note?.trim() || null,
        },
        update: {
          countTowardNormalizedDividend: body.countTowardNormalizedDividend,
          note: body.note?.trim() || null,
        },
      })
    ));

    return success<IStockDividendMarkingUpdateRes>({
      eventId: body.eventId,
      countTowardNormalizedDividend: body.countTowardNormalizedDividend,
      note: body.note?.trim() || null,
    });
  } catch (error) {
    return fail(error);
  }
}
