import { prisma } from '@libs/prisma';
import { ITransactionAnalyzeReq, ITransactionAnalyzeRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { getSession } from '@libs/session';

export async function POST(req: Request) {
  try {
    const { categoryId, year, month, granularity, includeCouponDiscount } = (await req.json()) as ITransactionAnalyzeReq;

    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);

    if (!year) throw new Error('year is required');

    // Default: month granularity (back-compat).
    const mode = granularity ?? 'month';
    let startDate: Date;
    let endDate: Date;

    if (mode === 'year') {
      startDate = new Date(year, 0, 1, 0, 0, 0, 0);
      endDate = new Date(year, 11, 31, 23, 59, 59, 999);
    } else {
      if (!month || month < 1 || month > 12) throw new Error('Invalid month');
      startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
      endDate = new Date(year, month, 0, 23, 59, 59, 999);
    }

    const whereClause: any = {
      userId: Number(userId),
      date: { gte: startDate, lte: endDate },
    };
    if (categoryId) whereClause.categoryId = Number(categoryId);

    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      orderBy: { date: 'desc' },
      include: { category: true, coupon: true },
    });

    const grossTotal = transactions.reduce((sum, t) => sum + t.amount, 0);
    const couponDiscountTotal = transactions.reduce((sum, t) => sum + t.couponDiscount, 0);
    const netTotal = transactions.reduce((sum, t) => sum + Math.max(0, t.amount - t.couponDiscount), 0);
    const total = includeCouponDiscount ? grossTotal : netTotal;
    const visibleTransactions = transactions.map((transaction) => ({
      ...transaction,
      amount: includeCouponDiscount ? transaction.amount : Math.max(0, transaction.amount - transaction.couponDiscount),
    }));

    const usageMap = new Map<string, { couponId: number | null; name: string; discount: number; count: number }>();
    transactions.forEach((transaction) => {
      if (transaction.couponDiscount <= 0) return;
      const couponId = transaction.couponId ?? null;
      const name = transaction.coupon?.name ?? transaction.couponName ?? '已删除券';
      const key = `${couponId ?? 'deleted'}:${name}`;
      const current = usageMap.get(key) ?? { couponId, name, discount: 0, count: 0 };
      current.discount += transaction.couponDiscount;
      current.count += 1;
      usageMap.set(key, current);
    });

    const couponUsages = [...usageMap.values()]
      .map((item) => ({ ...item, discount: Number(item.discount.toFixed(2)) }))
      .sort((a, b) => b.discount - a.discount);

    return success<ITransactionAnalyzeRes>({
      transactions: visibleTransactions,
      total,
      grossTotal,
      netTotal,
      couponDiscountTotal,
      couponUsages,
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return fail(error);
  }
}
