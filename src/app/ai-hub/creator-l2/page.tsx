// import { prisma } from '@libs/prisma';
import path from 'path';
import { Main } from './main';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function App() {
  // const tools = await prisma.aI_Tool.findMany();

  const filePath = path.join(process.cwd(), 'public', 'creator.md');
  const markdown = fs.readFileSync(filePath, 'utf-8');

  return <Main markdown={markdown} />;
}
