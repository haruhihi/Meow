import { prisma } from '@libs/prisma';
import { Main } from './main';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function App() {
  const tools = await prisma.aI_Tool.findMany();
  return <Main tools={tools} />;
}
