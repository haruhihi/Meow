import { Prisma } from '@prisma/client';
import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import {
  IStockAiReportCreateReq,
  IStockAiReportCreateRes,
  IStockAiReportSourceLink,
  StockAiReportListItem,
} from '@dtos/meow';
import { normalizeSymbol, requireOwnedStockSymbol } from '../../helpers';

const normalizeText = (value: unknown, label: string, maxLength?: number) => {
  if (typeof value !== 'string') throw new Error(`${label} is required`);
  const text = value.trim();
  if (!text) throw new Error(`${label} is required`);
  return maxLength ? text.slice(0, maxLength) : text;
};

const normalizeSlugPart = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const normalizeReportDate = (value?: string) => {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('reportDate is invalid');
  return date;
};

const normalizeSourceLinks = (value?: IStockAiReportSourceLink[]): IStockAiReportSourceLink[] => {
  if (!value) return [];
  if (!Array.isArray(value)) throw new Error('sourceLinks must be an array');
  return value.map((item) => ({
    title: normalizeText(item?.title, 'sourceLink.title', 120),
    url: normalizeText(item?.url, 'sourceLink.url', 500),
  }));
};

const toInputJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const readSourceLinks = (value: Prisma.JsonValue): IStockAiReportSourceLink[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const title = 'title' in item ? item.title : null;
      const url = 'url' in item ? item.url : null;
      return typeof title === 'string' && typeof url === 'string' ? { title, url } : null;
    })
    .filter((item): item is IStockAiReportSourceLink => item !== null);
};

const toListItem = (report: Awaited<ReturnType<typeof prisma.stockAiReport.upsert>>): StockAiReportListItem => ({
  id: report.id,
  userId: report.userId,
  slug: report.slug,
  symbol: report.symbol,
  title: report.title,
  summary: report.summary,
  content: report.content,
  sourceLinks: readSourceLinks(report.sourceLinks),
  reportDate: report.reportDate.toISOString(),
  createdAt: report.createdAt.toISOString(),
  updatedAt: report.updatedAt.toISOString(),
});

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockAiReportCreateReq;
    const symbol = normalizeSymbol(body.symbol ?? '');
    if (!symbol) throw new Error('symbol is required');
    await requireOwnedStockSymbol(uid, symbol);

    const title = normalizeText(body.title, 'title', 160);
    const summary = normalizeText(body.summary, 'summary', 500);
    const content = normalizeText(body.content, 'content');
    const reportDate = normalizeReportDate(body.reportDate);
    const slug = body.slug?.trim()
      ? normalizeText(body.slug, 'slug', 120)
      : `${symbol.toLowerCase()}-${normalizeSlugPart(title)}-${reportDate.toISOString().slice(0, 10)}`;
    const sourceLinks = toInputJson(normalizeSourceLinks(body.sourceLinks));

    const report = await prisma.stockAiReport.upsert({
      where: { userId_slug: { userId: uid, slug } },
      create: {
        userId: uid,
        symbol,
        slug,
        title,
        summary,
        content,
        sourceLinks,
        reportDate,
      },
      update: {
        symbol,
        title,
        summary,
        content,
        sourceLinks,
        reportDate,
      },
    });

    return success<IStockAiReportCreateRes>({ report: toListItem(report) });
  } catch (error) {
    return fail(error);
  }
}