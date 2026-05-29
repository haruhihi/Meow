import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockRemarkUpdateReq, IStockRemarkUpdateRes } from '@dtos/meow';
import { normalizeRemarkContent, normalizeRemarkDate, stockRemarkToListItem } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockRemarkUpdateReq;
    if (!body.id) throw new Error('id is required');

    const existing = await prisma.stockRemark.findFirst({
      where: { id: body.id, userId: uid },
    });
    if (!existing) throw new Error('remark not found');

    const data: { remarkDate?: string; content?: string } = {};
    if (body.remarkDate !== undefined) {
      const remarkDate = normalizeRemarkDate(body.remarkDate);
      if (remarkDate !== existing.remarkDate) {
        const conflict = await prisma.stockRemark.findFirst({
          where: {
            userId: uid,
            symbol: existing.symbol,
            remarkDate,
            id: { not: existing.id },
          },
        });
        if (conflict) throw new Error('remark already exists for this date');
      }
      data.remarkDate = remarkDate;
    }
    if (body.content !== undefined) {
      data.content = normalizeRemarkContent(body.content);
    }
    if (Object.keys(data).length === 0) throw new Error('nothing to update');

    const remark = await prisma.stockRemark.update({
      where: { id: body.id },
      data,
    });

    return success<IStockRemarkUpdateRes>({ remark: stockRemarkToListItem(remark) });
  } catch (error) {
    return fail(error);
  }
}