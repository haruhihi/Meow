import { prisma } from '@libs/prisma';
import { ITransactionSearchReq, ITransactionSearchRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { getSession } from '@libs/session';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<ITransactionSearchReq>;
    const page = body.page ?? 0;
    const pageSize = body.pageSize ?? 50;

    const userId = (await getSession())?.userId;

    if (!userId) {
      throw new Error(`User not found:${userId}`);
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        userId: Number(userId),
      },
      orderBy: {
        date: 'desc',
      },
      skip: page * pageSize,
      take: pageSize,
      include: {
        category: true,
      },
    });

    return success<ITransactionSearchRes>({
      transactions,
    });
  } catch (error) {
    return fail(error);
  }
}
