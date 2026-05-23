import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockDividendMarkingUpdateReq, IStockDividendMarkingUpdateRes } from '@dtos/meow';

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

    const marking = await prisma.stockDividendMarking.upsert({
      where: { userId_eventId: { userId: uid, eventId: body.eventId } },
      create: {
        userId: uid,
        eventId: body.eventId,
        countTowardNormalizedDividend: body.countTowardNormalizedDividend,
        note: body.note?.trim() || null,
      },
      update: {
        countTowardNormalizedDividend: body.countTowardNormalizedDividend,
        note: body.note?.trim() || null,
      },
    });

    return success<IStockDividendMarkingUpdateRes>({
      eventId: marking.eventId,
      countTowardNormalizedDividend: marking.countTowardNormalizedDividend,
      note: marking.note,
    });
  } catch (error) {
    return fail(error);
  }
}
