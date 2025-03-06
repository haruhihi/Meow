import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';

export async function POST(request: Request) {
  try {
    const { name, desc, icon, link, category1, category2, tags, registration, free, pro, pro_price, score } =
      (await request.json()) as {
        name?: string;
        desc?: string;
        icon?: string;
        link?: string;
        category1: string;
        category2?: string;
        tags?: string;
        registration?: boolean;
        free?: boolean;
        pro?: boolean;
        pro_price?: string;
        score?: number;
      };

    if (!name || !desc || !link) {
      throw new Error(`Invalid params, name: ${name}, desc: ${desc}, link: ${link}, icon: ${icon ? '-' : icon}`);
    }

    const newAITool = await prisma.aI_Tool.create({
      data: {
        name,
        desc,
        icon,
        link,
        category1,
        category2,
        tags: tags?.split(',') ?? [],
        registration,
        free,
        pro,
        pro_price,
        score,
      },
    });

    return success({ tool: newAITool });
  } catch (error) {
    return fail(error);
  }
}
