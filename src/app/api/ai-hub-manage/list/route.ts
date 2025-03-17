import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';

export async function POST() {
  try {
    const tools = await prisma.aI_Tool.findMany();

    return success([...tools, ...tools, ...tools, ...tools, ...tools, ...tools]);
  } catch (error) {
    return fail(error);
  }
}
