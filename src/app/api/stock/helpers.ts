import { prisma } from '@libs/prisma';
import type {
  IStockPortfolioAccountSummary,
  IStockPortfolioSymbolSummary,
  StockHoldingWithAccount,
} from '@dtos/meow';

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
    where: {
      userId,
      ...(trimmedKeyword
        ? {
            OR: [
              { symbol: { contains: trimmedKeyword, mode: 'insensitive' as const } },
              { name: { contains: trimmedKeyword, mode: 'insensitive' as const } },
              { account: { name: { contains: trimmedKeyword, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    },
    include: { account: true },
    orderBy: [{ account: { sortOrder: 'asc' } }, { accountId: 'asc' }, { symbol: 'asc' }],
  });

  const totalMarketValue = roundStockValue(holdings.reduce((sum, holding) => sum + marketValueOf(holding), 0));
  const accountSummaries = buildAccountSummaries(accounts, holdings, totalMarketValue);
  const symbolSummaries = buildSymbolSummaries(holdings, totalMarketValue);

  return {
    accounts,
    holdings,
    totalMarketValue,
    accountSummaries,
    symbolSummaries,
  };
};

export const roundStockValue = (value: number) => Math.round(value * 100) / 100;

export const marketValueOf = (holding: { quantity: number; currentPrice: number }) =>
  roundStockValue(holding.quantity * holding.currentPrice);

const percentOf = (value: number, total: number) => (total > 0 ? value / total : 0);

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
