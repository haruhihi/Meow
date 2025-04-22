// import { prisma } from '@libs/prisma';
// import path from 'path';
import { Main } from './main';
// import fs from 'fs';
import { getDictionary } from './dictionaries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function App(props: { params: { lang: string } }) {
  const { lang } = props.params;
  // const tools = await prisma.aI_Tool.findMany();

  // const filePath = path.join(process.cwd(), 'public', 'creator.md');
  // const markdown = fs.readFileSync(filePath, 'utf-8');
  const dict = await getDictionary(lang as any);

  return <Main dict={dict} lang={lang} />;
}


export const metadata = {
  title: 'Bing AI Writing',
  description: 'Bing AI Writing',
};