import { ITransactionDeleteReq } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getSession } from '@libs/session';

export async function POST(req: Request) {
  try {
    const { ids } = (await req.json()) as ITransactionDeleteReq;
    const userId = (await getSession())?.userId;

    if (!userId) {
      throw new Error(`User not found:${userId}`);
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('IDs are required');
    }

    const deleteTransactions = await prisma.$transaction(async (tx) => {
      const transactions = await tx.transaction.findMany({
        where: {
          id: { in: ids },
          userId: Number(userId),
        },
        select: { id: true, couponId: true, couponDiscount: true },
      });

      for (const transaction of transactions) {
        if (transaction.couponId && transaction.couponDiscount > 0) {
          await tx.coupon.update({
            where: { id: transaction.couponId },
            data: { remainingAmount: { increment: transaction.couponDiscount } },
          });
        }
      }

      return tx.transaction.deleteMany({
        where: {
          id: { in: transactions.map((item) => item.id) },
          userId: Number(userId),
        },
      });
    });

    return success(deleteTransactions);
  } catch (error) {
    console.error(error);
    return fail(error);
  }
}
