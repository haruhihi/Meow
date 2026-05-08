import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { ICouponSearchReq, ICouponSearchRes } from '@dtos/meow';

const monthKey = (year: number, month: number) => year * 12 + month;

const fromMonthKey = (key: number) => {
  const zeroBased = key - 1;
  return {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
};

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json().catch(() => ({}))) as ICouponSearchReq;
    const where: any = {};

    if (body.year && body.month) {
      if (body.month < 1 || body.month > 12) throw new Error('Invalid month');
      if (body.includeAdjacent) {
        const current = monthKey(body.year, body.month);
        where.OR = [-1, 0, 1].map((offset) => {
          const item = fromMonthKey(current + offset);
          return { validYear: item.year, validMonth: item.month };
        });
      } else {
        where.validYear = body.year;
        where.validMonth = body.month;
      }
    }

    if (!body.includeEmpty) {
      where.remainingAmount = { gt: 0 };
    }

    if (body.keyword?.trim()) {
      where.name = { contains: body.keyword.trim(), mode: 'insensitive' };
    }

    const coupons = await prisma.coupon.findMany({
      where,
      orderBy: [{ validYear: 'asc' }, { validMonth: 'asc' }, { name: 'asc' }],
    });

    return success<ICouponSearchRes>({ coupons });
  } catch (error) {
    return fail(error);
  }
}
