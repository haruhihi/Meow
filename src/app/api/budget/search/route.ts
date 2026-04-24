import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IBudgetSearchReq, IBudgetSearchRes } from '@dtos/meow';

// Returns the active monthly budget(s) for a user/month. For now we only
// support a single overall monthly budget (categoryId = null).
export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const { year, month } = (await req.json()) as IBudgetSearchReq;
    if (!year || !month || month < 1 || month > 12) {
      throw new Error('year and month are required');
    }

    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const budgets = await prisma.budget.findMany({
      where: {
        users: { some: { id: uid } },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: { category: true },
      orderBy: { startDate: 'desc' },
    });

    return success<IBudgetSearchRes>({ budgets });
  } catch (error) {
    return fail(error);
  }
}
