#!/usr/bin/env node

import { setAppDatabaseUrl } from './database-url.mjs';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

setAppDatabaseUrl();

const prisma = new PrismaClient();
const SNAPSHOT_SCHEMA_VERSION = 1;
const STOCK_UNIVERSE_PATH = new URL('../src/config/stock-universe.json', import.meta.url);

const parseArgs = () => {
  const args = process.argv.slice(2);
  let userId = 0;
  let source = 'script';
  let date = new Date();
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--user-id') {
      userId = Number(args[index + 1] ?? 0);
      index += 1;
    } else if (arg === '--source') {
      source = String(args[index + 1] ?? source).trim() || source;
      index += 1;
    } else if (arg === '--date') {
      date = new Date(String(args[index + 1] ?? ''));
      index += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  if (Number.isNaN(date.getTime())) throw new Error('invalid --date');
  return { userId, source, date, dryRun };
};

const roundStockValue = (value) => Math.round(value * 100) / 100;
const marketValueOf = (holding) => roundStockValue(holding.quantity * holding.currentPrice);
const percentOf = (value, total) => (total > 0 ? value / total : 0);
const formatSnapshotMonth = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const toJson = (value) => JSON.parse(JSON.stringify(value));

const loadStockUniverse = () => {
  const text = readFileSync(STOCK_UNIVERSE_PATH, 'utf8');
  const items = JSON.parse(text);
  return Array.isArray(items)
    ? new Map(items.map((item) => [String(item?.symbol ?? '').trim().toUpperCase(), item]))
    : new Map();
};

const stockUniverseBySymbol = loadStockUniverse();
const getStockSector = (symbol) => stockUniverseBySymbol.get(symbol.trim().toUpperCase())?.sector ?? '其他';

const sumMarkedDividendEvents = (events, totalShares) => {
  if (events.length === 0) return null;
  const total = events.reduce((sum, event) => {
    const cashPerTen = event.cashPerTen;
    const baseShares = event.dividendBaseShares ?? totalShares;
    if (!cashPerTen || cashPerTen <= 0 || !baseShares || baseShares <= 0) return sum;
    return sum + (cashPerTen / 10) * baseShares;
  }, 0);
  return total > 0 ? roundStockValue(total) : null;
};

const buildComputedMetrics = (summary, fundamental, override, dividendEvents) => {
  const totalShares = fundamental?.totalShares ?? null;
  const normalizedDividend = sumMarkedDividendEvents(dividendEvents, totalShares) ?? override?.normalizedDividend ?? null;
  const companyMarketCap = totalShares && totalShares > 0 ? summary.currentPrice * totalShares : null;

  return {
    totalShares,
    normalizedDividend,
    reportDate: fundamental?.reportDate?.toISOString() ?? null,
    normalizedDividendYield: companyMarketCap && normalizedDividend && normalizedDividend > 0 ? normalizedDividend / companyMarketCap : null,
  };
};

const buildStockPortfolio = async (userId) => {
  const accounts = await prisma.stockAccount.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  const holdings = await prisma.stockHolding.findMany({
    where: { userId },
    include: { account: true },
    orderBy: [{ account: { sortOrder: 'asc' } }, { accountId: 'asc' }, { symbol: 'asc' }],
  });
  const quotes = await prisma.stockQuote.findMany({ where: { userId } });
  const cash = await prisma.stockCash.findUnique({ where: { userId } });
  const symbols = [...new Set(holdings.map((holding) => holding.symbol))];
  const [fundamentals, overrides, markedDividends] = await Promise.all([
    prisma.stockFundamental.findMany({ where: { symbol: { in: symbols } }, orderBy: [{ symbol: 'asc' }, { reportDate: 'desc' }] }),
    prisma.stockMetricOverride.findMany({ where: { userId, symbol: { in: symbols } } }),
    prisma.stockDividendMarking.findMany({
      where: { userId, countTowardNormalizedDividend: true, event: { symbol: { in: symbols } } },
      include: { event: true },
    }),
  ]);
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const latestFundamentalBySymbol = new Map();
  fundamentals.forEach((fundamental) => {
    if (!latestFundamentalBySymbol.has(fundamental.symbol)) latestFundamentalBySymbol.set(fundamental.symbol, fundamental);
  });
  const overrideBySymbol = new Map(overrides.map((override) => [override.symbol, override]));
  const markedDividendEventsBySymbol = new Map();
  markedDividends.forEach((marking) => {
    const current = markedDividendEventsBySymbol.get(marking.event.symbol) ?? [];
    current.push(marking.event);
    markedDividendEventsBySymbol.set(marking.event.symbol, current);
  });
  const holdingsWithQuotes = holdings.map((holding) => {
    const quote = quoteBySymbol.get(holding.symbol);
    const currentPrice = quote?.currentPrice ?? 0;
    return {
      ...holding,
      quote: quote ?? null,
      name: quote?.name ?? holding.symbol,
      currentPrice,
    };
  });
  const totalMarketValue = roundStockValue(holdingsWithQuotes.reduce((sum, holding) => sum + marketValueOf(holding), 0));
  const cashAmount = roundStockValue(cash?.amount ?? 0);
  const totalAssetValue = roundStockValue(totalMarketValue + cashAmount);
  const symbolMap = new Map();

  holdingsWithQuotes.forEach((holding) => {
    const current = symbolMap.get(holding.symbol) ?? {
      symbol: holding.symbol,
      name: holding.name,
      sector: getStockSector(holding.symbol),
      currentPrice: holding.currentPrice,
      quantity: 0,
      marketValue: 0,
      percent: 0,
      holdingCount: 0,
      accounts: [],
    };
    current.quantity += holding.quantity;
    current.marketValue = roundStockValue(current.marketValue + marketValueOf(holding));
    current.holdingCount += 1;
    if (!current.accounts.includes(holding.account.name)) current.accounts.push(holding.account.name);
    symbolMap.set(holding.symbol, current);
  });

  const symbolSummaries = [...symbolMap.values()]
    .map((summary) => ({
      ...summary,
      quantity: roundStockValue(summary.quantity),
      percent: percentOf(summary.marketValue, totalMarketValue),
      ...buildComputedMetrics(
        summary,
        latestFundamentalBySymbol.get(summary.symbol),
        overrideBySymbol.get(summary.symbol),
        markedDividendEventsBySymbol.get(summary.symbol) ?? []
      ),
    }))
    .sort((left, right) => right.marketValue - left.marketValue || left.symbol.localeCompare(right.symbol));

  return {
    accounts,
    holdings: holdingsWithQuotes,
    cashAmount,
    totalMarketValue,
    totalAssetValue,
    cashPercent: percentOf(cashAmount, totalAssetValue),
    symbolSummaries,
  };
};

const buildSnapshotPayload = async (userId, snapshotAt, source) => {
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
  const expectedDividend = roundStockValue(
    portfolio.symbolSummaries.reduce((sum, summary) => sum + summary.marketValue * (summary.normalizedDividendYield ?? 0), 0)
  );
  const summary = {
    totalMarketValue: portfolio.totalMarketValue,
    totalAssetValue: portfolio.totalAssetValue,
    cashAmount: portfolio.cashAmount,
    expectedDividend,
    portfolioDividendYield: portfolio.totalMarketValue > 0 ? expectedDividend / portfolio.totalMarketValue : 0,
    holdingCount: portfolio.holdings.length,
    symbolCount: portfolio.symbolSummaries.length,
  };

  return toJson({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotAt: snapshotAt.toISOString(),
    snapshotMonth: formatSnapshotMonth(snapshotAt),
    source,
    summary,
    portfolio,
    raw: { accounts, holdings, quotes, cash, overrides, dividendMarkings, dividendEvents, fundamentals, aiReports },
  });
};

const main = async () => {
  const options = parseArgs();
  const users = await prisma.user.findMany({
    where: options.userId ? { id: options.userId } : {},
    orderBy: { id: 'asc' },
    select: { id: true, account: true },
  });
  let created = 0;

  for (const user of users) {
    const payload = await buildSnapshotPayload(user.id, options.date, options.source);
    if (options.dryRun) {
      console.log(`[dry-run] user=${user.id} account=${user.account} month=${payload.snapshotMonth} symbols=${payload.summary.symbolCount}`);
      continue;
    }

    const snapshot = await prisma.stockSnapshot.create({
      data: {
        userId: user.id,
        snapshotAt: options.date,
        snapshotMonth: payload.snapshotMonth,
        source: options.source,
        payload,
      },
    });
    created += 1;
    console.log(`created snapshot id=${snapshot.id} user=${user.id} account=${user.account} month=${snapshot.snapshotMonth}`);
  }

  console.log(`stock snapshot sync finished: users=${users.length} created=${created} dryRun=${options.dryRun}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });