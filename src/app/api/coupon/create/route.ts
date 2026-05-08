import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { ICouponCreateReq, ICouponCreateRes } from '@dtos/meow';

const monthRange = (year: number, month: number) => ({
  startDate: new Date(year, month - 1, 1, 0, 0, 0, 0),
  endDate: new Date(year, month, 0, 23, 59, 59, 999),
});

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const { name, type, amount, validYear, validMonth } = (await req.json()) as ICouponCreateReq;
    if (!name?.trim()) throw new Error('name is required');
    if (!amount || amount <= 0) throw new Error('amount must be greater than 0');
    if (!validYear || !validMonth || validMonth < 1 || validMonth > 12) {
      throw new Error('validYear and validMonth are required');
    }

    const { startDate, endDate } = monthRange(validYear, validMonth);
    const coupon = await prisma.coupon.create({
      data: {
        name: name.trim(),
        type: type?.trim() || null,
        amount,
        remainingAmount: amount,
        validYear,
        validMonth,
        startDate,
        endDate,
      },
    });

    return success<ICouponCreateRes>({ coupon });
  } catch (error) {
    return fail(error);
  }
}
