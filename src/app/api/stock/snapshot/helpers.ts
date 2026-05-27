import { prisma } from '@libs/prisma';
import { Prisma, StockSnapshot } from '@prisma/client';
import { IStockSnapshotSummary, StockSnapshotListItem } from '@dtos/meow';
import { buildStockPortfolio, roundStockValue } from '../helpers';

export const STOCK_SNAPSHOT_SCHEMA_VERSION = 1;

type DuplicatePolicy = 'append' | 'replace';

export const formatSnapshotMonth = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const toInputJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const readNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export const buildStockSnapshotSummary = (portfolio: Awaited<ReturnType<typeof buildStockPortfolio>>): IStockSnapshotSummary => {
  const expectedDividend = roundStockValue(
    portfolio.symbolSummaries.reduce(
      (sum, summary) => sum + summary.marketValue * (summary.normalizedDividendYield ?? 0),
      0
    )
  );
  const portfolioDividendYield = portfolio.totalMarketValue > 0 ? expectedDividend / portfolio.totalMarketValue : 0;

  return {
    totalMarketValue: portfolio.totalMarketValue,
    totalAssetValue: portfolio.totalAssetValue,
    cashAmount: portfolio.cashAmount,
    expectedDividend,
    portfolioDividendYield,
    holdingCount: portfolio.holdings.length,
    symbolCount: portfolio.symbolSummaries.length,
  };
};

export const buildStockSnapshotPayload = async (userId: number, options: { snapshotAt: Date; source: string }) => {
  const portfolio = await buildStockPortfolio(userId);
  const symbols = portfolio.symbolSummaries.map((summary) => summary.symbol);
  const [accounts, holdings, quotes, cash, overrides, dividendMarkings, dividendEvents, fundamentals, aiReports] = await Promise.all([
    prisma.stockAccount.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.stockHolding.findMany({ where: { userId }, orderBy: [{ accountId: 'asc' }, { symbol: 'asc' }] }),
    prisma.stockQuote.findMany({ where: { userId }, orderBy: { symbol: 'asc' } }),
    prisma.stockCash.findUnique({ where: { userId } }),
    prisma.stockMetricOverride.findMany({ where: { userId }, orderBy: { symbol: 'asc' } }),
    prisma.stockDividendMarking.findMany({ where: { userId }, include: { event: true }, orderBy: { eventId: 'asc' } }),
    prisma.stockDividendEvent.findMany({ where: { symbol: { in: symbols } }, orderBy: [{ symbol: 'asc' }, { exDividendDate: 'desc' }] }),
    prisma.stockFundamental.findMany({ where: { symbol: { in: symbols } }, orderBy: [{ symbol: 'asc' }, { reportDate: 'desc' }] }),
    prisma.stockAiReport.findMany({
      where: { userId, symbol: { in: symbols } },
      orderBy: [{ reportDate: 'desc' }, { id: 'desc' }],
      select: { id: true, slug: true, symbol: true, title: true, summary: true, sourceLinks: true, reportDate: true, createdAt: true, updatedAt: true },
    }),
  ]);
  const snapshotMonth = formatSnapshotMonth(options.snapshotAt);

  return {
    schemaVersion: STOCK_SNAPSHOT_SCHEMA_VERSION,
    snapshotAt: options.snapshotAt.toISOString(),
    snapshotMonth,
    source: options.source,
    summary: buildStockSnapshotSummary(portfolio),
    portfolio,
    raw: {
      accounts,
      holdings,
      quotes,
      cash,
      overrides,
      dividendMarkings,
      dividendEvents,
      fundamentals,
      aiReports,
    },
  };
};

export const getStockSnapshotMonthState = async (userId: number, snapshotMonth: string) => {
  const [count, latestSnapshot] = await Promise.all([
    prisma.stockSnapshot.count({ where: { userId, snapshotMonth } }),
    prisma.stockSnapshot.findFirst({
      where: { userId, snapshotMonth },
      orderBy: [{ snapshotAt: 'desc' }, { id: 'desc' }],
    }),
  ]);

  return { count, latestSnapshot: latestSnapshot ? toStockSnapshotListItem(latestSnapshot) : null };
};

export const createStockSnapshot = async (
  userId: number,
  options: { snapshotAt: Date; source: string; duplicatePolicy: DuplicatePolicy }
) => {
  const payload = await buildStockSnapshotPayload(userId, options);
  const data = {
    userId,
    snapshotAt: options.snapshotAt,
    snapshotMonth: payload.snapshotMonth,
    source: options.source,
    payload: toInputJson(payload),
  };

  if (options.duplicatePolicy === 'replace') {
    const [, snapshot] = await prisma.$transaction([
      prisma.stockSnapshot.deleteMany({ where: { userId, snapshotMonth: payload.snapshotMonth } }),
      prisma.stockSnapshot.create({ data }),
    ]);
    return snapshot;
  }

  return prisma.stockSnapshot.create({ data });
};

const summaryFromPayload = (payload: Prisma.JsonValue): IStockSnapshotSummary => {
  const value = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const summary = value.summary && typeof value.summary === 'object' && !Array.isArray(value.summary)
    ? value.summary as Record<string, unknown>
    : {};
  const portfolio = value.portfolio && typeof value.portfolio === 'object' && !Array.isArray(value.portfolio)
    ? value.portfolio as Record<string, unknown>
    : {};
  const symbolSummaries = Array.isArray(portfolio.symbolSummaries) ? portfolio.symbolSummaries : [];
  const expectedDividend = readNumber(summary.expectedDividend) || roundStockValue(
    symbolSummaries.reduce((sum, item) => {
      if (!item || typeof item !== 'object') return sum;
      const record = item as Record<string, unknown>;
      return sum + readNumber(record.marketValue) * readNumber(record.normalizedDividendYield);
    }, 0)
  );
  const totalMarketValue = readNumber(summary.totalMarketValue) || readNumber(portfolio.totalMarketValue);

  return {
    totalMarketValue,
    totalAssetValue: readNumber(summary.totalAssetValue) || readNumber(portfolio.totalAssetValue),
    cashAmount: readNumber(summary.cashAmount) || readNumber(portfolio.cashAmount),
    expectedDividend,
    portfolioDividendYield: readNumber(summary.portfolioDividendYield) || (totalMarketValue > 0 ? expectedDividend / totalMarketValue : 0),
    holdingCount: readNumber(summary.holdingCount) || (Array.isArray(portfolio.holdings) ? portfolio.holdings.length : 0),
    symbolCount: readNumber(summary.symbolCount) || symbolSummaries.length,
  };
};

export const toStockSnapshotListItem = (snapshot: StockSnapshot): StockSnapshotListItem => ({
  id: snapshot.id,
  snapshotAt: snapshot.snapshotAt.toISOString(),
  snapshotMonth: snapshot.snapshotMonth,
  source: snapshot.source,
  summary: summaryFromPayload(snapshot.payload),
  createdAt: snapshot.createdAt.toISOString(),
  updatedAt: snapshot.updatedAt.toISOString(),
});

export const listStockSnapshots = async (userId: number, limit = 60) => {
  const snapshots = await prisma.stockSnapshot.findMany({
    where: { userId },
    orderBy: [{ snapshotAt: 'desc' }, { id: 'desc' }],
    take: Math.min(Math.max(limit, 1), 240),
  });
  return snapshots.reverse().map(toStockSnapshotListItem);
};