import { ITimeEntrySearchReq, ITimeEntrySearchRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getSession } from '@libs/session';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<ITimeEntrySearchReq>;
    const page = body.page ?? 0;
    const pageSize = body.pageSize ?? 50;
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);

    const timeEntries = await prisma.timeEntry.findMany({
      where: { userId: Number(userId) },
      orderBy: { endedAt: 'desc' },
      skip: page * pageSize,
      take: pageSize,
      include: {
        activityType: true,
        activities: {
          include: { activityType: true },
          orderBy: { id: 'asc' },
        },
      },
    });

    return success<ITimeEntrySearchRes>({ timeEntries });
  } catch (error) {
    return fail(error);
  }
}
