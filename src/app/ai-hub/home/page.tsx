import { prisma } from '@libs/prisma';
import { Main } from './main';

export default async function App() {
  const tools = await prisma.aI_Tool.findMany();
  return <Main tools={tools} />;
}
