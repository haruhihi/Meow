import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { AI_Tool } from '@prisma/client';

// const mock: Prisma.AI_ToolGetPayload<{
//   include: {
//     pricing: true;
//   };
// }>[] = [
//   {
//     url: 'https://yige.baidu.com',
//     category1: 'Image',
//     category2: 'Image generation',
//     name: '文心一格',
//     desc: 'AI艺术和创意辅助平台，人人皆可“一语成画”',
//     tags: ['AI作画', 'AI绘画', 'AI创作'],
//     registration: false,
//     pricing: { free: true, pro: true, pro_price: '120元/年' },
//   },
// ];

export async function POST(request: Request) {
  try {
    const { token, data } = (await request.json()) as {
      token: string;
      data: AI_Tool[];
    };

    if (token !== 'reruijie' || !data) {
      throw new Error(`Invalid params`);
    }

    const newTools = await prisma.aI_Tool.createMany({
      data,
    });

    return success({ tool: newTools });
  } catch (error) {
    return fail(error);
  }
}
