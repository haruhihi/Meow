import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { ICouponDeleteReq } from '@dtos/meow';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const { id } = (await req.json()) as ICouponDeleteReq;
    if (!id) throw new Error('id is required');

    await prisma.coupon.delete({ where: { id } });
    return success({ id });
  } catch (error) {
    return fail(error);
  }
}
