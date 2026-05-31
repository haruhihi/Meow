import { Prisma } from '@prisma/client';
import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import {
  IStockAiReportListReq,
  IStockAiReportListRes,
  IStockAiReportSourceLink,
  StockAiReportListItem,
} from '@dtos/meow';
import { normalizeSymbol } from '../../helpers';

const normalizeSourceLinks = (value: Prisma.JsonValue): IStockAiReportSourceLink[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const title = 'title' in item ? item.title : null;
      const url = 'url' in item ? item.url : null;
      if (typeof title !== 'string' || typeof url !== 'string') return null;
      return { title, url };
    })
    .filter((item): item is IStockAiReportSourceLink => item !== null);
};

const toListItem = (report: Awaited<ReturnType<typeof prisma.stockAiReport.findMany>>[number]): StockAiReportListItem => ({
  id: report.id,
  userId: report.userId,
  slug: report.slug,
  symbol: report.symbol,
  title: report.title,
  summary: report.summary,
  content: report.content,
  sourceLinks: normalizeSourceLinks(report.sourceLinks),
  reportDate: report.reportDate.toISOString(),
  createdAt: report.createdAt.toISOString(),
  updatedAt: report.updatedAt.toISOString(),
});

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json().catch(() => ({}))) as IStockAiReportListReq;
    const symbol = body.symbol ? normalizeSymbol(body.symbol) : null;
    const reports = await prisma.stockAiReport.findMany({
      where: { userId: uid, ...(symbol ? { symbol } : {}) },
      orderBy: [{ reportDate: 'desc' }, { id: 'desc' }],
    });

    return success<IStockAiReportListRes>({ reports: reports.map(toListItem) });
  } catch (error) {
    return fail(error);
  }
}