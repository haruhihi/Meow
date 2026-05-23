import { prisma } from '@libs/prisma';
import type {
  IStockPortfolioAccountSummary,
  IStockPortfolioSectorSummary,
  IStockPortfolioSymbolSummary,
  StockHoldingWithAccount,
} from '@dtos/meow';
import type { StockAccount, StockHolding, StockQuote } from '@prisma/client';

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
  '000651': '消费',
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
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
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
  const symbolSummaries = buildSymbolSummaries(holdingsWithQuotes, totalAssetValue);
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

export const roundStockValue = (value: number) => Math.round(value * 100) / 100;

export const marketValueOf = (holding: { quantity: number; currentPrice: number }) =>
  roundStockValue(holding.quantity * holding.currentPrice);

const percentOf = (value: number, total: number) => (total > 0 ? value / total : 0);

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
  totalMarketValue: number
): IStockPortfolioSymbolSummary[] => {
  const bySymbol = new Map<string, IStockPortfolioSymbolSummary>();

  holdings.forEach((holding) => {
    const marketValue = marketValueOf(holding);
    const current = bySymbol.get(holding.symbol) ?? {
      symbol: holding.symbol,
      name: holding.name,
      sector: SECTOR_BY_SYMBOL[holding.symbol] ?? '其他',
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
    }))
    .sort((left, right) => right.marketValue - left.marketValue || left.symbol.localeCompare(right.symbol));
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
