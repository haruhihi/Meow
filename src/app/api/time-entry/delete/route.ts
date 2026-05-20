import { ITimeEntryDeleteReq } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getSession } from '@libs/session';

export async function POST(req: Request) {
  try {
    const { ids } = (await req.json()) as ITimeEntryDeleteReq;
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('IDs are required');

    const result = await prisma.timeEntry.deleteMany({
      where: {
        id: { in: ids },
        userId: Number(userId),
      },
    });

    return success(result);
  } catch (error) {
    return fail(error);
  }
}
