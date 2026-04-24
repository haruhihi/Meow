import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { ICategoryDeleteReq, ICategoryDeleteRes } from '@dtos/meow';

const ADMIN_IDS = new Set([1, 2]);

export async function POST(request: Request) {
  try {
    const uid = await getUID();
    if (!uid || !ADMIN_IDS.has(uid)) throw new Error('unauthorized');

    const { id } = (await request.json()) as ICategoryDeleteReq;
    if (!id) throw new Error('id is required');

    const [children, txnCount, budgetCount] = await Promise.all([
      prisma.category.count({ where: { parentId: id } }),
      prisma.transaction.count({ where: { categoryId: id } }),
      prisma.budget.count({ where: { categoryId: id } }),
    ]);

    if (children > 0) throw new Error(`还有 ${children} 个子类目，请先移动或合并`);
    if (txnCount > 0) throw new Error(`还有 ${txnCount} 笔账单，请先合并到其它类目`);
    if (budgetCount > 0) throw new Error(`还有 ${budgetCount} 条预算，请先处理`);

    await prisma.category.delete({ where: { id } });
    return success<ICategoryDeleteRes>({ id });
  } catch (error) {
    return fail(error);
  }
}
