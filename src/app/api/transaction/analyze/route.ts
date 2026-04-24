import { prisma } from '@libs/prisma';
import { ITransactionAnalyzeReq, ITransactionAnalyzeRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { getSession } from '@libs/session';

export async function POST(req: Request) {
  try {
    const { categoryId, year, month, granularity } = (await req.json()) as ITransactionAnalyzeReq;

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
      include: { category: true },
    });

    const total = transactions.reduce((sum, t) => sum + t.amount, 0);

    return success<ITransactionAnalyzeRes>({ transactions, total });
  } catch (error) {
    console.error('Analyze error:', error);
    return fail(error);
  }
}
