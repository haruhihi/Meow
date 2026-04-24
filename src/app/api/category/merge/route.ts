import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { ICategoryMergeReq, ICategoryMergeRes } from '@dtos/meow';

// Admin-only user ids (same gate as the client-side Category tab).
const ADMIN_IDS = new Set([1, 2]);

export async function POST(request: Request) {
  try {
    const uid = await getUID();
    if (!uid || !ADMIN_IDS.has(uid)) {
      throw new Error('unauthorized');
    }

    const { fromId, toId } = (await request.json()) as ICategoryMergeReq;
    if (!fromId || !toId) throw new Error('fromId and toId are required');
    if (fromId === toId) throw new Error('cannot merge a category into itself');

    const result = await prisma.$transaction(async (tx) => {
      const from = await tx.category.findUnique({
        where: { id: fromId },
        include: { children: true },
      });
      const to = await tx.category.findUnique({ where: { id: toId } });
      if (!from) throw new Error(`source category ${fromId} not found`);
      if (!to) throw new Error(`target category ${toId} not found`);

      // Prevent creating a cycle: target must not be a descendant of source.
      let cursor: { parentId: number | null } | null = to;
      while (cursor?.parentId) {
        if (cursor.parentId === fromId) {
          throw new Error('target is a descendant of source — cycle');
        }
        cursor = await tx.category.findUnique({
          where: { id: cursor.parentId },
          select: { parentId: true },
        });
      }

      // Reparent any children of the source to the target (source will be deleted).
      if (from.children.length > 0) {
        await tx.category.updateMany({
          where: { parentId: fromId },
          data: { parentId: toId },
        });
      }

      // Re-point all transactions & budgets from source to target.
      const txns = await tx.transaction.updateMany({
        where: { categoryId: fromId },
        data: { categoryId: toId },
      });
      const budgets = await tx.budget.updateMany({
        where: { categoryId: fromId },
        data: { categoryId: toId },
      });

      await tx.category.delete({ where: { id: fromId } });

      return {
        movedChildren: from.children.length,
        movedTransactions: txns.count,
        movedBudgets: budgets.count,
      };
    });

    return success<ICategoryMergeRes>(result);
  } catch (error) {
    return fail(error);
  }
}
