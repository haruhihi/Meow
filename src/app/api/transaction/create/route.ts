import { prisma } from '@libs/prisma';
import { ITransactionCreateRes, ITransactionCreateReq } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { getSession } from '@libs/session';
import { isMoneyGreater, roundMoney } from '@utils/money';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ITransactionCreateReq;
    const { categoryId, date, description, couponId } = body;
    const amount = roundMoney(body.amount);
    const couponDiscount = roundMoney(body.couponDiscount ?? 0);
    const userId = (await getSession())?.userId;

    if (!userId) {
      throw new Error(`User not found:${userId}`);
    }

    if (!amount || amount <= 0) {
      throw new Error('amount must be greater than 0');
    }

    if (couponDiscount < 0) {
      throw new Error('coupon discount cannot be negative');
    }

    if (isMoneyGreater(couponDiscount, amount)) {
      throw new Error('coupon discount cannot exceed amount');
    }

    if (couponDiscount > 0 && !couponId) {
      throw new Error('coupon is required when coupon discount is used');
    }

    const newTransaction = await prisma.$transaction(async (tx) => {
      let couponName: string | null = null;

      if (couponId && couponDiscount > 0) {
        const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
        if (!coupon) throw new Error('coupon not found');
        if (isMoneyGreater(couponDiscount, coupon.remainingAmount)) {
          throw new Error('coupon remaining amount is not enough');
        }
        couponName = coupon.name;
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { remainingAmount: roundMoney(coupon.remainingAmount - couponDiscount) },
        });
      }

      return tx.transaction.create({
        data: {
          userId: Number(userId),
          categoryId: categoryId,
          couponId: couponDiscount > 0 ? couponId : null,
          couponName,
          couponDiscount,
          amount,
          description,
          date: new Date(date),
        },
      });
    });

    return success<ITransactionCreateRes>({
      transaction: newTransaction,
    });
  } catch (error) {
    return fail(error);
  }
}
