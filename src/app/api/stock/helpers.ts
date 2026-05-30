import { prisma } from '@libs/prisma';
import { marketValueOf, percentOf, roundStockValue } from '@utils/stock-calculations';
import type {
  IStockPortfolioAccountSummary,
  IStockPortfolioSectorSummary,
  IStockPortfolioSymbolSummary,
  StockRemarkListItem,
  StockHoldingWithAccount,
} from '@dtos/meow';
import type { StockAccount, StockDividendEvent, StockFundamental, StockHolding, StockMetricOverride, StockQuote, StockRemark } from '@prisma/client';

export { marketValueOf, roundStockValue };

const SECTOR_ORDER = ['消费', '白酒', '红利', '中药', '医药', '其他'];

const SECTOR_BY_SYMBOL: Record<string, string> = {
  '600519': '白酒',
  '000858': '白酒',
  '002304': '白酒',
  '000568': '白酒',
  '600809': '白酒',
  '600600': '消费',
  '600887': '消费',
  '603288': '消费',
  '002507': '消费',
  '600298': '消费',
  '603345': '消费',
  '000651': '红利',
  '000333': '消费',
  '601888': '消费',
  '000423': '中药',
  '000538': '中药',
  '000999': '中药',
  '600085': '中药',
  '600329': '中药',
  '600750': '中药',
  '600436': '中药',
  '600332': '中药',
  '000963': '医药',
  '600161': '医药',
  '601006': '红利',
  '601728': '红利',
  '600941': '红利',
  '601288': '红利',
  '600036': '红利',
  '600900': '红利',
  '600377': '红利',
  '601088': '红利',
  '601318': '红利',
};

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
  const accounts = await prisma.stockAccount.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });

  const holdings = await prisma.stockHolding.findMany({
    where: { userId },
    include: { account: true },
    orderBy: [{ account: { sortOrder: 'asc' } }, { accountId: 'asc' }, { symbol: 'asc' }],
  });
  const quotes = await prisma.stockQuote.findMany({
    where: { userId },
  });
  const cash = await prisma.stockCash.findUnique({
    where: { userId },
  });
  const symbols = [...new Set(holdings.map((holding) => holding.symbol))];
  const fundamentals = await prisma.stockFundamental.findMany({
    where: { symbol: { in: symbols } },
    orderBy: [{ symbol: 'asc' }, { reportDate: 'desc' }],
  });
  const balanceStatements = await prisma.stockFinancialStatement.findMany({
    where: { symbol: { in: symbols }, statement: 'balance', reportName: { contains: '年报' } },
    orderBy: [{ symbol: 'asc' }, { reportDate: 'desc' }],
  });
  const overrides = await prisma.stockMetricOverride.findMany({
    where: { userId, symbol: { in: symbols } },
  });
  const markedDividends = await prisma.stockDividendMarking.findMany({
    where: {
      userId,
      countTowardNormalizedDividend: true,
      event: { symbol: { in: symbols } },
    },
    include: { event: true },
  });
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const latestFundamentalBySymbol = new Map<string, StockFundamental>();
  const annualFundamentalsBySymbol = new Map<string, StockFundamental[]>();
  fundamentals.forEach((fundamental) => {
    if (!latestFundamentalBySymbol.has(fundamental.symbol)) {
      latestFundamentalBySymbol.set(fundamental.symbol, fundamental);
    }
    if (fundamental.reportName?.includes('年报')) {
      const annuals = annualFundamentalsBySymbol.get(fundamental.symbol) ?? [];
      annuals.push(fundamental);
      annualFundamentalsBySymbol.set(fundamental.symbol, annuals);
    }
  });
  const latestAnnualBalanceBySymbol = new Map<string, { fields: unknown }>();
  balanceStatements.forEach((statement) => {
    if (!latestAnnualBalanceBySymbol.has(statement.symbol)) {
      latestAnnualBalanceBySymbol.set(statement.symbol, { fields: statement.fields });
    }
  });
  const overrideBySymbol = new Map(overrides.map((override) => [override.symbol, override]));
  const markedDividendEventsBySymbol = new Map<string, StockDividendEvent[]>();
  markedDividends.forEach((marking) => {
    const current = markedDividendEventsBySymbol.get(marking.event.symbol) ?? [];
    current.push(marking.event);
    markedDividendEventsBySymbol.set(marking.event.symbol, current);
  });
  const holdingsWithQuotes = holdings
    .map((holding) => attachQuote(holding, quoteBySymbol.get(holding.symbol)))
    .filter((holding) => {
      if (!trimmedKeyword) return true;
      const keyword = trimmedKeyword.toLowerCase();
      return (
        holding.symbol.toLowerCase().includes(keyword) ||
        holding.name.toLowerCase().includes(keyword) ||
        holding.account.name.toLowerCase().includes(keyword)
      );
    });

  const totalMarketValue = roundStockValue(holdingsWithQuotes.reduce((sum, holding) => sum + marketValueOf(holding), 0));
  const cashAmount = roundStockValue(cash?.amount ?? 0);
  const totalAssetValue = roundStockValue(totalMarketValue + cashAmount);
  const accountSummaries = buildAccountSummaries(accounts, holdingsWithQuotes, totalAssetValue);
  const symbolSummaries = buildSymbolSummaries(holdingsWithQuotes, totalAssetValue, latestFundamentalBySymbol, annualFundamentalsBySymbol, latestAnnualBalanceBySymbol, overrideBySymbol, markedDividendEventsBySymbol);
  const sectorSummaries = buildSectorSummaries(symbolSummaries, totalAssetValue);

  return {
    accounts,
    holdings: holdingsWithQuotes,
    cashAmount,
    totalMarketValue,
    totalAssetValue,
    cashPercent: percentOf(cashAmount, totalAssetValue),
    accountSummaries,
    sectorSummaries,
    symbolSummaries,
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
  totalMarketValue: number,
  fundamentalBySymbol: Map<string, StockFundamental>,
  annualFundamentalsBySymbol: Map<string, StockFundamental[]>,
  annualBalanceBySymbol: Map<string, { fields: unknown }>,
  overrideBySymbol: Map<string, StockMetricOverride>,
  markedDividendEventsBySymbol: Map<string, StockDividendEvent[]>
): IStockPortfolioSymbolSummary[] => {
  const bySymbol = new Map<string, IStockPortfolioSymbolSummary>();

  holdings.forEach((holding) => {
    const marketValue = marketValueOf(holding);
    const current = bySymbol.get(holding.symbol) ?? {
      symbol: holding.symbol,
      name: holding.name,
      sector: SECTOR_BY_SYMBOL[holding.symbol] ?? '其他',
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
        fundamentalBySymbol.get(summary.symbol),
        annualFundamentalsBySymbol.get(summary.symbol) ?? [],
        annualBalanceBySymbol.get(summary.symbol),
        overrideBySymbol.get(summary.symbol),
        markedDividendEventsBySymbol.get(summary.symbol) ?? []
      ),
    }))
    .sort((left, right) => right.marketValue - left.marketValue || left.symbol.localeCompare(right.symbol));
};

const buildComputedMetrics = (
  summary: IStockPortfolioSymbolSummary,
  fundamental?: StockFundamental,
  annualFundamentals: StockFundamental[] = [],
  annualBalance?: { fields: unknown },
  override?: StockMetricOverride,
  dividendEvents: StockDividendEvent[] = []
) => {
  const totalShares = fundamental?.totalShares ?? null;
  const deductedNetProfit = fundamental?.deductedNetProfit ?? null;
  const deductedNetProfitTtm = fundamental?.deductedNetProfitTtm ?? null;
  const netProfit = fundamental?.netProfit ?? null;
  const netProfitTtm = fundamental?.netProfitTtm ?? null;
  const revenue = fundamental?.revenue ?? null;
  const revenueTtm = fundamental?.revenueTtm ?? null;
  const netAsset = fundamental?.netAsset ?? null;
  const totalAssets = fundamental?.totalAssets ?? null;
  const operatingCashFlow = fundamental?.operatingCashFlow ?? null;
  const operatingCashFlowTtm = fundamental?.operatingCashFlowTtm ?? null;
  const capitalExpenditure = fundamental?.capitalExpenditure ?? null;
  const capitalExpenditureTtm = fundamental?.capitalExpenditureTtm ?? null;
  const eventNormalizedDividend = sumMarkedDividendEvents(dividendEvents, totalShares);
  const normalizedDividend = eventNormalizedDividend ?? override?.normalizedDividend ?? null;
  const companyMarketCap = totalShares && totalShares > 0 ? summary.currentPrice * totalShares : null;
  const freeCashFlow = operatingCashFlow != null && capitalExpenditure != null
    ? operatingCashFlow - capitalExpenditure
    : null;
  const freeCashFlowTtm = operatingCashFlowTtm != null && capitalExpenditureTtm != null
    ? operatingCashFlowTtm - capitalExpenditureTtm
    : null;
  const annualsByYear = new Map(annualFundamentals.map((item) => [item.reportDate.getFullYear(), item]));
  const latestAnnual = annualFundamentals[0];
  const baseAnnual = latestAnnual ? annualsByYear.get(latestAnnual.reportDate.getFullYear() - 5) : undefined;
  const deductedNetProfitCagr5 = latestAnnual?.deductedNetProfit && latestAnnual.deductedNetProfit > 0 && baseAnnual?.deductedNetProfit && baseAnnual.deductedNetProfit > 0
    ? (latestAnnual.deductedNetProfit / baseAnnual.deductedNetProfit) ** (1 / 5) - 1
    : null;
  const goodwill = readStatementNumber(annualBalance?.fields, 'goodwill');
  const deductedPe = companyMarketCap && deductedNetProfit && deductedNetProfit > 0 ? roundStockValue(companyMarketCap / deductedNetProfit) : null;
  const deductedPeTtm = companyMarketCap && deductedNetProfitTtm && deductedNetProfitTtm > 0 ? roundStockValue(companyMarketCap / deductedNetProfitTtm) : null;

  return {
    totalShares,
    deductedNetProfit,
    deductedNetProfitTtm,
    netProfit,
    netProfitTtm,
    revenue,
    revenueTtm,
    netAsset,
    totalAssets,
    operatingCashFlow,
    operatingCashFlowTtm,
    capitalExpenditure,
    capitalExpenditureTtm,
    normalizedDividend,
    reportDate: fundamental?.reportDate.toISOString() ?? null,
    deductedNetProfitCagr5,
    deductedPeg: deductedPe && deductedNetProfitCagr5 && deductedNetProfitCagr5 > 0 ? roundStockValue(deductedPe / (deductedNetProfitCagr5 * 100)) : null,
    goodwill,
    goodwillToNetAsset: goodwill != null && netAsset && netAsset > 0 ? goodwill / netAsset : null,
    goodwillToTotalAssets: goodwill != null && totalAssets && totalAssets > 0 ? goodwill / totalAssets : null,
    deductedPe,
    deductedPeTtm,
    pb: companyMarketCap && netAsset && netAsset > 0 ? roundStockValue(companyMarketCap / netAsset) : null,
    deductedRoe: deductedNetProfit && netAsset && netAsset > 0 ? deductedNetProfit / netAsset : null,
    deductedRoeTtm: deductedNetProfitTtm && netAsset && netAsset > 0 ? deductedNetProfitTtm / netAsset : null,
    normalizedDividendYield: companyMarketCap && normalizedDividend && normalizedDividend > 0 ? normalizedDividend / companyMarketCap : null,
    freeCashFlow: freeCashFlow != null ? roundStockValue(freeCashFlow) : null,
    freeCashFlowTtm: freeCashFlowTtm != null ? roundStockValue(freeCashFlowTtm) : null,
    fcfDividendCoverage: freeCashFlowTtm != null && normalizedDividend && normalizedDividend > 0 ? freeCashFlowTtm / normalizedDividend : null,
    operatingCashFlowToDeductedNetProfit: operatingCashFlowTtm != null && deductedNetProfitTtm && deductedNetProfitTtm > 0 ? operatingCashFlowTtm / deductedNetProfitTtm : null,
  };
};

const readStatementNumber = (fields: unknown, key: string) => {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  const value = (fields as Record<string, unknown>)[key];
  const raw = Array.isArray(value) ? value[0] : value;
  const numberValue = typeof raw === 'number' ? raw : Number(raw ?? Number.NaN);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const sumMarkedDividendEvents = (events: StockDividendEvent[], totalShares: number | null) => {
  if (events.length === 0) return null;
  const uniqueEvents = [...new Map(events.map((event) => [dividendEventDedupeKey(event), event])).values()];
  const total = uniqueEvents.reduce((sum, event) => {
    const cashPerTen = event.cashPerTen;
    const baseShares = event.dividendBaseShares ?? totalShares;
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
    .sort((left, right) => SECTOR_ORDER.indexOf(left.sector) - SECTOR_ORDER.indexOf(right.sector));
};
