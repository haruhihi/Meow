import { Prisma } from '@prisma/client';
import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { ICouponSeedRes } from '@dtos/meow';

const DEFAULT_COUPONS = [
  { name: '运动券', type: 'sport', amount: 200 },
  { name: '自由经费券', type: 'free', amount: 800 },
];

const monthRange = (year: number, month: number) => ({
  startDate: new Date(year, month - 1, 1, 0, 0, 0, 0),
  endDate: new Date(year, month, 0, 23, 59, 59, 999),
});

const addMonth = (year: number, month: number, offset: number) => {
  const value = new Date(year, month - 1 + offset, 1);
  return { year: value.getFullYear(), month: value.getMonth() + 1 };
};

export async function POST() {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const data: Prisma.CouponCreateManyInput[] = [];
    for (let offset = 0; offset <= 60; offset += 1) {
      const { year, month } = addMonth(2026, 1, offset);
      const { startDate, endDate } = monthRange(year, month);
      for (const template of DEFAULT_COUPONS) {
        data.push({
          name: template.name,
          type: template.type,
          amount: template.amount,
          remainingAmount: template.amount,
          validYear: year,
          validMonth: month,
          startDate,
          endDate,
          seedKey: `default:${template.type}:${year}-${String(month).padStart(2, '0')}`,
        });
      }
    }

    const result = await prisma.coupon.createMany({ data, skipDuplicates: true });
    return success<ICouponSeedRes>({ created: result.count, skipped: data.length - result.count });
  } catch (error) {
    return fail(error);
  }
}
