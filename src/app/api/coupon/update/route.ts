import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { ICouponUpdateReq, ICouponUpdateRes } from '@dtos/meow';
import { roundMoney } from '@utils/money';

const monthRange = (year: number, month: number) => ({
  startDate: new Date(year, month - 1, 1, 0, 0, 0, 0),
  endDate: new Date(year, month, 0, 23, 59, 59, 999),
});

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as ICouponUpdateReq;
    if (!body.id) throw new Error('id is required');

    const current = await prisma.coupon.findUnique({ where: { id: body.id } });
    if (!current) throw new Error('coupon not found');

    const nextYear = body.validYear ?? current.validYear;
    const nextMonth = body.validMonth ?? current.validMonth;
    if (nextMonth < 1 || nextMonth > 12) throw new Error('Invalid month');

    const data: any = {};
    if (body.name != null) {
      if (!body.name.trim()) throw new Error('name is required');
      data.name = body.name.trim();
    }
    if (body.type !== undefined) data.type = body.type?.trim() || null;
    if (body.amount != null) {
      const amount = roundMoney(body.amount);
      if (amount <= 0) throw new Error('amount must be greater than 0');
      const delta = amount - current.amount;
      data.amount = amount;
      data.remainingAmount = roundMoney(Math.max(0, current.remainingAmount + delta));
    }
    if (body.validYear != null || body.validMonth != null) {
      const { startDate, endDate } = monthRange(nextYear, nextMonth);
      data.validYear = nextYear;
      data.validMonth = nextMonth;
      data.startDate = startDate;
      data.endDate = endDate;
    }

    const coupon = await prisma.coupon.update({
      where: { id: body.id },
      data,
    });

    return success<ICouponUpdateRes>({ coupon });
  } catch (error) {
    return fail(error);
  }
}
