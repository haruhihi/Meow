import { prisma } from '@libs/prisma';
import { ITransactionAnalyzeReq, ITransactionAnalyzeRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { getSession } from '@libs/session';
import dayjs from 'dayjs';

export async function POST(req: Request) {
  try {
    const { categoryId, year, month } = (await req.json()) as ITransactionAnalyzeReq;

    const userId = (await getSession())?.userId;

    if (!userId) {
      throw new Error(`User not found:${userId}`);
    }

    console.log('Analyze request:', { categoryId, year, month, userId });

    // Check if year and month are valid
    if (!year || !month || month < 1 || month > 12) {
      throw new Error('Invalid year or month');
    }

    // Create start and end dates directly without timezone issues
    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    console.log('Date range:', { 
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString(),
      displayRange: `${year}-${month.toString().padStart(2, '0')}`
    });

    // Build the where clause dynamically
    const whereClause: any = {
      userId: Number(userId),
      date: {
        gte: startDate,
        lte: endDate,
      },
    };

    // Add categoryId filter if provided
    if (categoryId) {
      whereClause.categoryId = Number(categoryId);
    }

    console.log('Where clause:', JSON.stringify(whereClause, null, 2));

    // First, let's check all transactions for this user
    const allUserTransactions = await prisma.transaction.findMany({
      where: {
        userId: Number(userId),
      },
      include: {
        category: true,
      },
    });
    console.log('All user transactions:', allUserTransactions.length);
    console.log('User transactions dates:', allUserTransactions.slice(0, 3).map(t => ({ date: t.date.toISOString(), amount: t.amount })));

    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      orderBy: {
        date: 'desc',
      },
      include: {
        category: true,
      },
    });

    console.log('Filtered transactions:', transactions.length);

    // Calculate total amount
    const total = transactions.reduce((sum, t) => sum + t.amount, 0);

    return success<ITransactionAnalyzeRes>({
      transactions,
      total,
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return fail(error);
  }
}
