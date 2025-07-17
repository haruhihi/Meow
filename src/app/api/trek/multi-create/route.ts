import { prisma } from '@libs/prisma';
import { ITrekCreateReq, ITrekCreateRes } from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';

export async function POST(request: Request) {
  try {
    const data = (await request.json()) as any;
    const userId = await getUID();
    data.forEach(({ date, count, type }: ITrekCreateReq)=> {
      if (!date || (!count && count!==0) || !userId || !type) {
        throw new Error(`非法的 params, date: ${date}, count: ${count}, userId: ${userId}, type: ${type}`);
      }
    })
   
    const newTrek = await prisma.trek.createMany({
      data: data.map(({date,count, type}: ITrekCreateReq) => {
        return  {
          date: new Date(date),
          count,
          userId,
          type,
        }
      }),
       skipDuplicates: true,
    });

    return success<any>({ trek: newTrek });
  } catch (error) {
    return fail(error);
  }
}
