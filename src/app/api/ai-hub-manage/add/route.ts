import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';

export async function POST(request: Request) {
  try {
    const { name, desc, icon, link } = (await request.json()) as {
      name?: string;
      desc?: string;
      icon?: string;
      link?: string;
    };

    if (!name || !desc || !icon || !link) {
      throw new Error(`Invalid params, name: ${name}, desc: ${desc}, link: ${link}, icon: ${icon ? '-' : icon}`);
    }

    const newAITool = await prisma.aI_Tool.create({
      data: {
        name,
        desc,
        icon,
        link,
      },
    });

    return success({ tool: newAITool });
  } catch (error) {
    return fail(error);
  }
}
