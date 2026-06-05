import { prisma } from '@libs/prisma';
import { marketValueOf, percentOf, roundStockValue } from '@utils/stock-calculations';
import { getStockSector, getStockUniverseItem, stockUniverse } from '../../../config/stock-universe';
import type {
  IStockPeValuationSummary,
  IStockPortfolioAccountSummary,
  IStockPortfolioSectorSummary,
  IStockPortfolioSymbolSummary,
  IStockProfitHistoryPoint,
  IStockPriceHistoryRes,
  IStockValuationHistoryPoint,
  IStockValuationHistoryRes,
  StockRemarkListItem,
  StockHoldingWithAccount,
} from '@dtos/meow';
import type { StockAccount, StockDividendEvent, StockHolding, StockMetricCache, StockMetricOverride, StockQuote, StockRemark } from '@prisma/client';

export { marketValueOf, roundStockValue };

const PE_VALUATION_PERCENTILES = [10, 25, 50, 75, 90];
const FUNDAMENTAL_CACHE_DOMAIN = 'fundamental_latest';
const VALUATION_CACHE_DOMAIN = 'valuation_weekly';
const VALUATION_SUMMARY_CACHE_DOMAIN = 'valuation_weekly_summary';
const SHANGHAI_INDEX_SYMBOL = '000001.SH';

export const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

export const normalizeName = (name: string) => name.trim();

export const normalizeRemarkDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('remarkDate must be YYYY-MM-DD');
  }

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('remarkDate is invalid');
  }

  return value;
};

export const normalizeRemarkContent = (value: unknown) => {
  if (typeof value !== 'string') throw new Error('content is required');
  const content = value.trim();
  if (!content) throw new Error('content is required');
  return content;
};

export const normalizeOptionalDate = (value: unknown) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('date must be YYYY-MM-DD');
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('date is invalid');
  }

  return date;
};

export const readNonNegativeNumber = (value: unknown, label: string) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be greater than or equal to 0`);
  }
  return numberValue;
};

export const requireOwnedStockAccount = async (userId: number, accountId: number) => {
  const account = await prisma.stockAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) throw new Error('account not found');
  return account;
};

export const requireOwnedStockSymbol = async (userId: number, symbol: string) => {
  const quote = await prisma.stockQuote.findUnique({
    where: { userId_symbol: { userId, symbol } },
  });
  if (quote) return quote;

  const universeItem = getStockUniverseItem(symbol);
  if (universeItem) {
    const now = new Date();
    return {
      id: 0,
      userId,
      symbol,
      name: universeItem.name,
      currentPrice: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  const holding = await prisma.stockHolding.findFirst({
    where: { userId, symbol },
  });
  if (!holding) throw new Error('stock not found');

  return {
    id: 0,
    userId,
    symbol,
    name: symbol,
    currentPrice: 0,
    createdAt: holding.createdAt,
    updatedAt: holding.updatedAt,
  };
};

export const stockRemarkToListItem = (remark: StockRemark): StockRemarkListItem => ({
  ...remark,
  createdAt: remark.createdAt.toISOString(),
  updatedAt: remark.updatedAt.toISOString(),
});

export const dividendEventDedupeKey = (event: Pick<StockDividendEvent, 'symbol' | 'reportPeriod' | 'cashPerTen' | 'bonusSharesPerTen' | 'transferSharesPerTen'>) => [
  event.symbol,
  event.reportPeriod ?? '',
  event.cashPerTen ?? 0,
  event.bonusSharesPerTen ?? 0,
  event.transferSharesPerTen ?? 0,
].join('|');

export const buildStockPortfolio = async (userId: number, keyword?: string) => {
  const trimmedKeyword = keyword?.trim();
  const [accounts, holdings, quotes, cash] = await Promise.all([
    prisma.stockAccount.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
    prisma.stockHolding.findMany({
      where: { userId },
      include: { account: true },
      orderBy: [{ account: { sortOrder: 'asc' } }, { accountId: 'asc' }, { symbol: 'asc' }],
    }),
    prisma.stockQuote.findMany({
      where: { userId },
    }),
    prisma.stockCash.findUnique({
      where: { userId },
    }),
  ]);
  const symbols = [...new Set([...holdings.map((holding) => holding.symbol), ...stockUniverse.map((item) => item.symbol)])];
  const [metricCaches, overrides, markedDividends, hiddenPreferences] = await Promise.all([
    prisma.stockMetricCache.findMany({
      where: { symbol: { in: symbols }, domain: { in: [FUNDAMENTAL_CACHE_DOMAIN, VALUATION_SUMMARY_CACHE_DOMAIN] } },
    }),
    prisma.stockMetricOverride.findMany({
      where: { userId, symbol: { in: symbols } },
    }),
    prisma.stockDividendMarking.findMany({
      where: {
        userId,
        countTowardNormalizedDividend: true,
        event: { symbol: { in: symbols } },
      },
      include: { event: true },
    }),
    prisma.stockSymbolPreference.findMany({
      where: { userId, isHidden: true },
      select: { symbol: true },
    }),
  ]);
  const hiddenSymbols = hiddenPreferences.map((preference) => preference.symbol);
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const overrideBySymbol = new Map(overrides.map((override) => [override.symbol, override]));
  const fundamentalCacheBySymbol = new Map<string, StockMetricCache>();
  const valuationCacheBySymbol = new Map<string, StockMetricCache>();
  metricCaches.forEach((cache) => {
    if (cache.domain === FUNDAMENTAL_CACHE_DOMAIN) fundamentalCacheBySymbol.set(cache.symbol, cache);
    if (cache.domain === VALUATION_SUMMARY_CACHE_DOMAIN) valuationCacheBySymbol.set(cache.symbol, cache);
  });
  const markedDividendEventsBySymbol = new Map<string, StockDividendEvent[]>();
  markedDividends.forEach((marking) => {
    const current = markedDividendEventsBySymbol.get(marking.event.symbol) ?? [];
    current.push(marking.event);
    markedDividendEventsBySymbol.set(marking.event.symbol, current);
  });
  const holdingsWithQuotes = holdings.map((holding) => attachQuote(holding, quoteBySymbol.get(holding.symbol)));
  const displayedHoldings = holdingsWithQuotes
    .filter((holding) => {
      if (!trimmedKeyword) return true;
      const keyword = trimmedKeyword.toLowerCase();
      return (
        holding.symbol.toLowerCase().includes(keyword) ||
        holding.name.toLowerCase().includes(keyword) ||
        holding.account.name.toLowerCase().includes(keyword)
      );
    });
  const displaySymbols = symbols.filter((symbol) => {
    if (!trimmedKeyword) return true;
    if (displayedHoldings.some((holding) => holding.symbol === symbol)) return true;
    const keyword = trimmedKeyword.toLowerCase();
    const universeItem = getStockUniverseItem(symbol);
    const quote = quoteBySymbol.get(symbol);
    return (
      symbol.toLowerCase().includes(keyword) ||
      (quote?.name ?? universeItem?.name ?? '').toLowerCase().includes(keyword) ||
      getStockSector(symbol).toLowerCase().includes(keyword)
    );
  });

  const totalMarketValue = roundStockValue(displayedHoldings.reduce((sum, holding) => sum + marketValueOf(holding), 0));
  const cashAmount = roundStockValue(cash?.amount ?? 0);
  const totalAssetValue = roundStockValue(totalMarketValue + cashAmount);
  const accountSummaries = buildAccountSummaries(accounts, displayedHoldings, totalAssetValue);
  const symbolSummaries = buildSymbolSummaries(displayedHoldings, displaySymbols, quoteBySymbol, totalAssetValue, fundamentalCacheBySymbol, valuationCacheBySymbol, overrideBySymbol, markedDividendEventsBySymbol);
  const sectorSummaries = buildSectorSummaries(symbolSummaries, totalAssetValue);

  return {
    accounts,
    holdings: displayedHoldings,
    cashAmount,
    totalMarketValue,
    totalAssetValue,
    cashPercent: percentOf(cashAmount, totalAssetValue),
    accountSummaries,
    sectorSummaries,
    symbolSummaries,
    hiddenSymbols,
  };
};

const attachQuote = (
  holding: StockHolding & { account: StockAccount },
  quote?: StockQuote
): StockHoldingWithAccount => {
  const resolvedQuote = quote ?? {
    id: 0,
    userId: holding.userId,
    symbol: holding.symbol,
    name: holding.symbol,
    currentPrice: 0,
    createdAt: holding.createdAt,
    updatedAt: holding.updatedAt,
  };

  return {
    ...holding,
    quote: resolvedQuote,
    name: resolvedQuote.name,
    currentPrice: resolvedQuote.currentPrice,
  };
};

const buildAccountSummaries = (
  accounts: Awaited<ReturnType<typeof prisma.stockAccount.findMany>>,
  holdings: StockHoldingWithAccount[],
  totalMarketValue: number
): IStockPortfolioAccountSummary[] =>
  accounts.map((account) => {
    const accountHoldings = holdings.filter((holding) => holding.accountId === account.id);
    const marketValue = roundStockValue(accountHoldings.reduce((sum, holding) => sum + marketValueOf(holding), 0));
    return {
      accountId: account.id,
      name: account.name,
      marketValue,
      percent: percentOf(marketValue, totalMarketValue),
      holdingCount: accountHoldings.length,
    };
  });

const buildSymbolSummaries = (
  holdings: StockHoldingWithAccount[],
  symbols: string[],
  quoteBySymbol: Map<string, StockQuote>,
  totalMarketValue: number,
  fundamentalCacheBySymbol: Map<string, StockMetricCache>,
  valuationCacheBySymbol: Map<string, StockMetricCache>,
  overrideBySymbol: Map<string, StockMetricOverride>,
  markedDividendEventsBySymbol: Map<string, StockDividendEvent[]>
): IStockPortfolioSymbolSummary[] => {
  const bySymbol = new Map<string, IStockPortfolioSymbolSummary>();

  symbols.forEach((symbol) => {
    const quote = quoteBySymbol.get(symbol);
    const universeItem = getStockUniverseItem(symbol);
    bySymbol.set(symbol, {
      symbol,
      name: quote?.name ?? universeItem?.name ?? symbol,
      sector: getStockSector(symbol),
      currentPrice: quote?.currentPrice ?? 0,
      quantity: 0,
      marketValue: 0,
      percent: 0,
      holdingCount: 0,
      accounts: [],
    });
  });

  holdings.forEach((holding) => {
    const marketValue = marketValueOf(holding);
    const current = bySymbol.get(holding.symbol) ?? {
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
    current.marketValue = roundStockValue(current.marketValue + marketValue);
    current.holdingCount += 1;
    if (!current.accounts.includes(holding.account.name)) {
      current.accounts.push(holding.account.name);
    }
    bySymbol.set(holding.symbol, current);
  });

  return [...bySymbol.values()]
    .map((summary) => ({
      ...summary,
      quantity: roundStockValue(summary.quantity),
      percent: percentOf(summary.marketValue, totalMarketValue),
      ...buildComputedMetrics(
        summary,
        fundamentalCacheBySymbol.get(summary.symbol),
        valuationCacheBySymbol.get(summary.symbol),
        overrideBySymbol.get(summary.symbol),
        markedDividendEventsBySymbol.get(summary.symbol) ?? [],
        false
      ),
    }))
    .sort((left, right) => right.marketValue - left.marketValue || left.symbol.localeCompare(right.symbol));
};

const buildComputedMetrics = (
  summary: IStockPortfolioSymbolSummary,
  fundamentalCache?: StockMetricCache,
  valuationCache?: StockMetricCache,
  override?: StockMetricOverride,
  dividendEvents: StockDividendEvent[] = [],
  includeValuationHistory = false
) => {
  const cacheMetrics = readCacheRecord(fundamentalCache?.metrics);
  const cacheWarnings = readCacheWarnings(fundamentalCache?.warnings);
  const totalShares = readCacheNumber(cacheMetrics, 'totalShares');
  const deductedNetProfit = readCacheNumber(cacheMetrics, 'deductedNetProfit');
  const deductedNetProfitTtm = readCacheNumber(cacheMetrics, 'deductedNetProfitTtm');
  const deductedNetProfitTtmWarning = cacheWarnings[0] ?? null;
  const netProfit = readCacheNumber(cacheMetrics, 'netProfit');
  const rawNetProfitTtm = readCacheNumber(cacheMetrics, 'netProfitTtm');
  const netProfitTtmQuality = validateNetProfitTtm(rawNetProfitTtm, deductedNetProfitTtm, fundamentalCache?.calculatedThroughReportName ?? null);
  const netProfitTtm = netProfitTtmQuality.value;
  const revenue = readCacheNumber(cacheMetrics, 'revenue');
  const revenueTtm = readCacheNumber(cacheMetrics, 'revenueTtm');
  const netAsset = readCacheNumber(cacheMetrics, 'netAsset');
  const totalAssets = readCacheNumber(cacheMetrics, 'totalAssets');
  const operatingCashFlow = readCacheNumber(cacheMetrics, 'operatingCashFlow');
  const operatingCashFlowTtm = readCacheNumber(cacheMetrics, 'operatingCashFlowTtm');
  const capitalExpenditure = readCacheNumber(cacheMetrics, 'capitalExpenditure');
  const capitalExpenditureTtm = readCacheNumber(cacheMetrics, 'capitalExpenditureTtm');
  const eventNormalizedDividend = sumMarkedDividendEvents(dividendEvents);
  const normalizedDividend = eventNormalizedDividend ?? override?.normalizedDividend ?? null;
  const companyMarketCap = totalShares && totalShares > 0 ? summary.currentPrice * totalShares : null;
  const freeCashFlow = operatingCashFlow != null && capitalExpenditure != null
    ? operatingCashFlow - capitalExpenditure
    : null;
  const freeCashFlowTtm = operatingCashFlowTtm != null && capitalExpenditureTtm != null
    ? operatingCashFlowTtm - capitalExpenditureTtm
    : null;
  const reportDate = readCacheString(cacheMetrics, 'reportDate') ?? fundamentalCache?.calculatedThroughReportDate?.toISOString() ?? null;
  const latestAnnualDeductedNetProfit = readCacheNumber(cacheMetrics, 'latestAnnualDeductedNetProfit');
  const deductedNetProfitCagr = readCacheNumber(cacheMetrics, 'deductedNetProfitCagr5');
  const deductedNetProfitCagrYears = readCacheNumber(cacheMetrics, 'deductedNetProfitCagrYears');
  const profitHistory = readCacheProfitHistory(cacheMetrics, 'profitHistory');
  const goodwill = readCacheNumber(cacheMetrics, 'goodwill');
  const deductedPe = companyMarketCap && latestAnnualDeductedNetProfit && latestAnnualDeductedNetProfit > 0 ? roundStockValue(companyMarketCap / latestAnnualDeductedNetProfit) : null;
  const deductedPeTtm = companyMarketCap && deductedNetProfitTtm && deductedNetProfitTtm > 0 ? roundStockValue(companyMarketCap / deductedNetProfitTtm) : null;
  const pb = companyMarketCap && netAsset && netAsset > 0 ? roundStockValue(companyMarketCap / netAsset) : null;
  const peValuation = buildPeValuation(summary.currentPrice, totalShares, deductedNetProfitTtm, deductedPeTtm, pb, profitHistory, valuationCache, includeValuationHistory);

  return {
    totalShares,
    deductedNetProfit,
    deductedNetProfitTtm,
    deductedNetProfitTtmWarning,
    financialCacheStatus: fundamentalCache?.status ?? null,
    financialDataReportDate: fundamentalCache?.calculatedThroughReportDate?.toISOString() ?? reportDate,
    financialDataReportName: fundamentalCache?.calculatedThroughReportName ?? null,
    valuationCacheStatus: valuationCache?.status ?? null,
    valuationDataReportDate: valuationCache?.calculatedThroughReportDate?.toISOString() ?? null,
    valuationDataReportName: valuationCache?.calculatedThroughReportName ?? null,
    valuationDataSnapshotDate: valuationCache?.calculatedThroughSnapshotDate?.toISOString() ?? null,
    netProfit,
    netProfitTtm,
    netProfitTtmWarning: netProfitTtmQuality.warning,
    revenue,
    revenueTtm,
    netAsset,
    totalAssets,
    operatingCashFlow,
    operatingCashFlowTtm,
    capitalExpenditure,
    capitalExpenditureTtm,
    normalizedDividend,
    reportDate,
    deductedNetProfitCagr5: deductedNetProfitCagr,
    deductedNetProfitCagrYears,
    deductedPeg: deductedPe != null && deductedNetProfitCagr != null && deductedNetProfitCagr !== 0
      ? roundStockValue(deductedPe / (deductedNetProfitCagr * 100))
      : null,
    goodwill,
    goodwillToNetAsset: goodwill != null && netAsset && netAsset > 0 ? goodwill / netAsset : null,
    goodwillToTotalAssets: goodwill != null && totalAssets && totalAssets > 0 ? goodwill / totalAssets : null,
    deductedPe,
    deductedPeTtm,
    pb,
    deductedRoe: deductedNetProfit && netAsset && netAsset > 0 ? deductedNetProfit / netAsset : null,
    deductedRoeTtm: deductedNetProfitTtm && netAsset && netAsset > 0 ? deductedNetProfitTtm / netAsset : null,
    normalizedDividendYield: companyMarketCap && normalizedDividend && normalizedDividend > 0 ? normalizedDividend / companyMarketCap : null,
    freeCashFlow: freeCashFlow != null ? roundStockValue(freeCashFlow) : null,
    freeCashFlowTtm: freeCashFlowTtm != null ? roundStockValue(freeCashFlowTtm) : null,
    fcfDividendCoverage: freeCashFlowTtm != null && normalizedDividend && normalizedDividend > 0 ? freeCashFlowTtm / normalizedDividend : null,
    operatingCashFlowToDeductedNetProfit: operatingCashFlowTtm != null && deductedNetProfitTtm && deductedNetProfitTtm > 0 ? operatingCashFlowTtm / deductedNetProfitTtm : null,
    peValuation,
  };
};

const percentileOfSorted = (sortedValues: number[], percentile: number) => {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const rank = (percentile / 100) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  return lower + (upper - lower) * weight;
};

const buildPeValuation = (
  currentPrice: number,
  totalShares: number | null,
  deductedNetProfitTtm: number | null,
  currentPe: number | null,
  currentPb: number | null,
  profitHistory: IStockProfitHistoryPoint[],
  valuationCache?: StockMetricCache,
  includeValuationHistory = false
): IStockPeValuationSummary | null => {
  const cachedValuation = readValuationCache(valuationCache, includeValuationHistory);
  const peValues = cachedValuation?.peValues ?? [];
  const pbValues = cachedValuation?.pbValues ?? [];
  if (peValues.length === 0 && pbValues.length === 0) return null;

  const deductedEpsTtm = totalShares && totalShares > 0 && deductedNetProfitTtm && deductedNetProfitTtm > 0
    ? deductedNetProfitTtm / totalShares
    : null;
  const resolvedCurrentPe = currentPrice > 0 && deductedEpsTtm && deductedEpsTtm > 0 ? currentPrice / deductedEpsTtm : currentPe;
  const currentPercentile = resolvedCurrentPe != null && peValues.length > 0
    ? percentileRank(peValues, resolvedCurrentPe)
    : null;
  const currentPbPercentile = currentPb != null && pbValues.length > 0
    ? percentileRank(pbValues, currentPb)
    : null;
  const targets = PE_VALUATION_PERCENTILES.map((percentile) => {
    const pe = percentileOfSorted(peValues, percentile);
    const price = pe != null && deductedEpsTtm != null ? pe * deductedEpsTtm : null;
    return {
      percentile,
      pe: pe != null ? roundStockValue(pe) : null,
      price: price != null ? roundStockValue(price) : null,
      upside: price != null && currentPrice > 0 ? price / currentPrice - 1 : null,
    };
  });

  return {
    currentPe: resolvedCurrentPe != null ? roundStockValue(resolvedCurrentPe) : null,
    currentPercentile,
    currentPbPercentile,
    sampleCount: peValues.length,
    pbSampleCount: pbValues.length,
    startDate: cachedValuation?.startDate ?? null,
    endDate: cachedValuation?.endDate ?? null,
    targets,
    profitHistory,
    valuationHistory: includeValuationHistory ? cachedValuation?.valuationHistory ?? [] : [],
  };
};

export const buildStockValuationHistory = async (symbol: string): Promise<IStockValuationHistoryRes> => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const cache = await prisma.stockMetricCache.findUnique({
    where: { symbol_domain: { symbol: normalizedSymbol, domain: VALUATION_CACHE_DOMAIN } },
  });
  const cachedValuation = readValuationCache(cache, true);
  const valuationHistory = cachedValuation?.valuationHistory ?? [];
  const dividendYieldByDate = await buildTtmDividendYieldByDate(normalizedSymbol, valuationHistory.map((item) => item.date));
  return {
    symbol: normalizedSymbol,
    startDate: cachedValuation?.startDate ?? null,
    endDate: cachedValuation?.endDate ?? null,
    valuationHistory: valuationHistory.map((item) => ({
      ...item,
      dividendYield: dividendYieldByDate.get(item.date.slice(0, 10)) ?? null,
    })),
  };
};

const buildTtmDividendYieldByDate = async (symbol: string, historyDates: string[]) => {
  if (historyDates.length === 0) return new Map<string, number>();
  const sortedHistoryDates = historyDates
    .map((date) => new Date(date))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());
  const minHistoryDate = sortedHistoryDates[0];
  const maxHistoryDate = sortedHistoryDates.at(-1);
  if (!minHistoryDate || !maxHistoryDate) return new Map<string, number>();
  const dividendStartDate = new Date(minHistoryDate);
  dividendStartDate.setFullYear(dividendStartDate.getFullYear() - 1);

  const [snapshots, events] = await Promise.all([
    prisma.stockValuationSnapshot.findMany({
      where: { symbol, period: 'WEEK' },
      select: { tradeDate: true, totalMarketCap: true },
      orderBy: { tradeDate: 'asc' },
    }),
    prisma.stockDividendEvent.findMany({
      where: {
        symbol,
        cashPerTen: { gt: 0 },
        exDividendDate: { not: null, gte: dividendStartDate, lte: maxHistoryDate },
      },
      orderBy: { exDividendDate: 'asc' },
    }),
  ]);
  if (snapshots.length === 0 || events.length === 0) return new Map<string, number>();

  const uniqueEvents = dedupeDividendEvents(events)
    .filter(isImplementedDividendEvent)
    .map((event) => ({
      exDividendDate: event.exDividendDate,
      dividendCash: calculateDividendEventCash(event),
    }))
    .filter((event): event is { exDividendDate: Date; dividendCash: number } => (
      event.exDividendDate != null && event.dividendCash != null && event.dividendCash > 0
    ));
  if (uniqueEvents.length === 0) return new Map<string, number>();

  const snapshotsByDate = new Map(snapshots.map((snapshot) => [snapshot.tradeDate.toISOString().slice(0, 10), snapshot]));
  const dividendYieldByDate = new Map<string, number>();
  historyDates.forEach((historyDate) => {
    const date = historyDate.slice(0, 10);
    const snapshot = snapshotsByDate.get(date);
    if (!snapshot) return;
    const marketCap = snapshot.totalMarketCap;
    if (marketCap == null || marketCap <= 0) return;
    const tradeDate = new Date(historyDate);
    if (Number.isNaN(tradeDate.getTime())) return;
    const startDate = new Date(tradeDate);
    startDate.setFullYear(startDate.getFullYear() - 1);
    const ttmDividendCash = uniqueEvents.reduce((sum, event) => {
      const exDateTime = event.exDividendDate.getTime();
      return exDateTime > startDate.getTime() && exDateTime <= tradeDate.getTime()
        ? sum + event.dividendCash
        : sum;
    }, 0);
    if (ttmDividendCash > 0) {
      dividendYieldByDate.set(date, ttmDividendCash / marketCap);
    }
  });
  return dividendYieldByDate;
};

const dedupeDividendEvents = (events: StockDividendEvent[]) => {
  const byKey = new Map<string, StockDividendEvent>();
  events.forEach((event) => {
    const key = dividendEventDedupeKey(event);
    const current = byKey.get(key);
    if (!current || preferDividendEvent(event, current) === event) {
      byKey.set(key, event);
    }
  });
  return [...byKey.values()].sort((left, right) => (left.exDividendDate?.getTime() ?? 0) - (right.exDividendDate?.getTime() ?? 0));
};

const isImplementedDividendEvent = (event: StockDividendEvent) => /实施|派发|已/.test(event.status ?? event.description ?? '');

const preferDividendEvent = (left: StockDividendEvent, right: StockDividendEvent) => {
  const leftHasExDate = left.exDividendDate ? 1 : 0;
  const rightHasExDate = right.exDividendDate ? 1 : 0;
  if (leftHasExDate !== rightHasExDate) return leftHasExDate > rightHasExDate ? left : right;
  const leftHasBaseShares = left.dividendBaseShares && left.dividendBaseShares > 0 ? 1 : 0;
  const rightHasBaseShares = right.dividendBaseShares && right.dividendBaseShares > 0 ? 1 : 0;
  if (leftHasBaseShares !== rightHasBaseShares) return leftHasBaseShares > rightHasBaseShares ? left : right;
  const leftImplemented = isImplementedDividendEvent(left) ? 1 : 0;
  const rightImplemented = isImplementedDividendEvent(right) ? 1 : 0;
  if (leftImplemented !== rightImplemented) return leftImplemented > rightImplemented ? left : right;
  return left.id > right.id ? left : right;
};

const calculateDividendEventCash = (
  event: StockDividendEvent
) => {
  const cashPerTen = event.cashPerTen;
  if (!cashPerTen || cashPerTen <= 0) return null;
  const baseShares = event.dividendBaseShares;
  return baseShares && baseShares > 0 ? (cashPerTen / 10) * baseShares : null;
};

export const buildStockPriceHistory = async (symbol: string, startDate: Date | null, endDate: Date | null): Promise<IStockPriceHistoryRes> => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const dateWhere = {
    ...(startDate ? { gte: startDate } : {}),
    ...(endDate ? { lte: endDate } : {}),
  };
  const dateFilter = startDate || endDate ? { tradeDate: dateWhere } : {};
  const [stockSnapshots, indexSnapshots] = await Promise.all([
    prisma.stockValuationSnapshot.findMany({
      where: { symbol: normalizedSymbol, period: 'WEEK', ...dateFilter },
      select: { tradeDate: true, close: true, adjFactor: true },
      orderBy: { tradeDate: 'asc' },
    }),
    prisma.stockValuationSnapshot.findMany({
      where: { symbol: SHANGHAI_INDEX_SYMBOL, period: 'WEEK', ...dateFilter },
      select: { tradeDate: true, close: true },
      orderBy: { tradeDate: 'asc' },
    }),
  ]);
  const latestAdjFactor = stockSnapshots
    .slice()
    .reverse()
    .find((snapshot) => snapshot.adjFactor != null && snapshot.adjFactor > 0)
    ?.adjFactor ?? null;
  const indexByDate = new Map(indexSnapshots.map((snapshot) => [snapshot.tradeDate.toISOString().slice(0, 10), snapshot.close]));
  const stockByDate = new Map(stockSnapshots.map((snapshot) => [snapshot.tradeDate.toISOString().slice(0, 10), snapshot]));
  const dateKeys = [...new Set([...stockByDate.keys(), ...indexByDate.keys()])].sort();
  const points = dateKeys.map((date) => {
    const stock = stockByDate.get(date);
    const close = stock?.close ?? null;
    const qfqClose = close != null && stock?.adjFactor != null && latestAdjFactor != null
      ? roundStockValue(close * stock.adjFactor / latestAdjFactor)
      : null;
    return {
      date: `${date}T00:00:00.000Z`,
      close,
      qfqClose,
      indexClose: indexByDate.get(date) ?? null,
    };
  });

  return {
    symbol: normalizedSymbol,
    indexSymbol: SHANGHAI_INDEX_SYMBOL,
    startDate: points[0]?.date ?? null,
    endDate: points.at(-1)?.date ?? null,
    latestAdjFactor,
    points,
  };
};

const percentileRank = (sortedValues: number[], value: number) => {
  if (sortedValues.length === 0) return null;
  return sortedValues.filter((item) => item <= value).length / sortedValues.length;
};

const validateNetProfitTtm = (netProfitTtm: number | null, deductedNetProfitTtm: number | null, reportName?: string | null) => {
  if (netProfitTtm != null && netProfitTtm > 0 && deductedNetProfitTtm != null && deductedNetProfitTtm > 0 && netProfitTtm < deductedNetProfitTtm * 0.5) {
    return {
      value: null,
      warning: `${reportName ?? '最新报告'} 归母净利润 TTM 与扣非净利润 TTM 冲突，已暂停展示 PE TTM`,
    };
  }
  return { value: netProfitTtm, warning: null };
};

const readCacheRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const readCacheNumber = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  const numberValue = typeof value === 'number' ? value : Number(value ?? Number.NaN);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const readCacheString = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return typeof value === 'string' ? value : null;
};

const readCacheWarnings = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string')
  : [];

const readCacheNumberArray = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : [];
};

const readCacheProfitHistory = (record: Record<string, unknown>, key: string): IStockProfitHistoryPoint[] => {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = readCacheRecord(item);
      const reportDate = readCacheString(row, 'reportDate');
      const year = readCacheNumber(row, 'year');
      if (!reportDate || year == null) return null;
      return {
        reportDate,
        year,
        deductedNetProfit: readCacheNumber(row, 'deductedNetProfit'),
        yoy: readCacheNumber(row, 'yoy'),
      };
    })
    .filter((item): item is IStockProfitHistoryPoint => item != null);
};

const readValuationCache = (cache?: StockMetricCache | null, includeHistory = true) => {
  if (!cache) return null;
  const metrics = readCacheRecord(cache.metrics);
  const rawHistory = Array.isArray(metrics.valuationHistory) ? metrics.valuationHistory : [];
  const valuationHistory = includeHistory ? rawHistory
    .map((item) => {
      const record = readCacheRecord(item);
      const date = readCacheString(record, 'date');
      if (!date) return null;
      return {
        date,
        pe: readCacheNumber(record, 'pe'),
        pb: readCacheNumber(record, 'pb'),
        dividendYield: readCacheNumber(record, 'dividendYield'),
        pePercentile: readCacheNumber(record, 'pePercentile'),
        pbPercentile: readCacheNumber(record, 'pbPercentile'),
      };
    })
    .filter((item): item is IStockValuationHistoryPoint => item != null) : [];

  const peValues = readCacheNumberArray(metrics, 'peValues')
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  const pbValues = readCacheNumberArray(metrics, 'pbValues')
    .filter((value) => value > 0)
    .sort((left, right) => left - right);

  return {
    peValues: peValues.length > 0 ? peValues : valuationHistory
      .map((item) => item.pe)
      .filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right),
    pbValues: pbValues.length > 0 ? pbValues : valuationHistory
      .map((item) => item.pb)
      .filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right),
    startDate: readCacheString(metrics, 'startDate'),
    endDate: readCacheString(metrics, 'endDate'),
    valuationHistory,
  };
};

const sumMarkedDividendEvents = (events: StockDividendEvent[]) => {
  if (events.length === 0) return null;
  const uniqueEvents = [...new Map(events.map((event) => [dividendEventDedupeKey(event), event])).values()];
  const total = uniqueEvents.reduce((sum, event) => {
    const cashPerTen = event.cashPerTen;
    const baseShares = event.dividendBaseShares;
    if (!cashPerTen || cashPerTen <= 0 || !baseShares || baseShares <= 0) return sum;
    return sum + (cashPerTen / 10) * baseShares;
  }, 0);
  return total > 0 ? roundStockValue(total) : null;
};

const buildSectorSummaries = (
  symbols: IStockPortfolioSymbolSummary[],
  totalAssetValue: number
): IStockPortfolioSectorSummary[] => {
  const bySector = new Map<string, IStockPortfolioSectorSummary>();

  symbols.forEach((symbol) => {
    const current = bySector.get(symbol.sector) ?? {
      sector: symbol.sector,
      marketValue: 0,
      percent: 0,
      symbolCount: 0,
      symbols: [],
    };

    current.marketValue = roundStockValue(current.marketValue + symbol.marketValue);
    current.symbolCount += 1;
    current.symbols.push(symbol);
    bySector.set(symbol.sector, current);
  });

  return [...bySector.values()]
    .map((summary) => ({
      ...summary,
      percent: percentOf(summary.marketValue, totalAssetValue),
      symbols: summary.symbols.sort((left, right) => right.marketValue - left.marketValue || left.symbol.localeCompare(right.symbol)),
    }))
    .sort((left, right) => right.marketValue - left.marketValue || left.sector.localeCompare(right.sector));
};
