import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IBudgetUpsertReq, IBudgetUpsertRes } from '@dtos/meow';

// Upsert the user's monthly overall budget for a given (year, month).
// Passing amount = 0 (or null) deletes any existing budget for that month.
export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const { year, month, amount } = (await req.json()) as IBudgetUpsertReq;
    if (!year || !month || month < 1 || month > 12) {
      throw new Error('year and month are required');
    }

    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Find any existing overall (categoryId == null) budget that exactly matches this month window
    // and is linked to this user.
    const existing = await prisma.budget.findFirst({
      where: {
        users: { some: { id: uid } },
        categoryId: null,
        startDate,
        endDate,
      },
    });

    if (!amount || amount <= 0) {
      if (existing) {
        // Detach the user; if no more users link to it, delete it.
        await prisma.budget.update({
          where: { id: existing.id },
          data: { users: { disconnect: { id: uid } } },
        });
        const remaining = await prisma.budget.findUnique({
          where: { id: existing.id },
          include: { users: true },
        });
        if (remaining && remaining.users.length === 0) {
          await prisma.budget.delete({ where: { id: existing.id } });
        }
      }
      return success<IBudgetUpsertRes>({ budget: null });
    }

    let budget;
    if (existing) {
      budget = await prisma.budget.update({
        where: { id: existing.id },
        data: { amount },
      });
    } else {
      budget = await prisma.budget.create({
        data: {
          amount,
          startDate,
          endDate,
          categoryId: null,
          users: { connect: { id: uid } },
        },
      });
    }

    return success<IBudgetUpsertRes>({ budget });
  } catch (error) {
    return fail(error);
  }
}
