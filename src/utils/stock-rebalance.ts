import type { StockAccount } from '@prisma/client';
import type {
  IStockPortfolioAccountSummary,
  IStockPortfolioSectorSummary,
  IStockPortfolioSymbolSummary,
  IStockSearchRes,
  StockHoldingWithAccount,
} from '@dtos/meow';
import { marketValueOf, percentOf, roundStockValue } from './stock-calculations';

const SECTOR_ORDER = ['消费', '白酒', '红利', '中药', '医药', '其他'];

export const REBALANCE_QUANTITY_STEP = 100;

export type StockRebalanceHolding = StockHoldingWithAccount & {
  isDraft?: boolean;
  originalQuantity: number;
};

export type StockRebalanceDraft = Omit<IStockSearchRes, 'holdings'> & {
  holdings: StockRebalanceHolding[];
  symbolOrder: string[];
};

export type StockRebalanceCreateInput = {
  accountId: number;
  symbol: string;
  name: string;
  quantity: number;
  currentPrice: number;
};

export type StockRebalanceDiffItem = {
  key: string;
  accountName: string;
  symbol: string;
  name: string;
  fromQuantity: number;
  toQuantity: number;
  quantityDelta: number;
  cashImpact: number;
  type: 'create' | 'update' | 'delete';
};

export type StockRebalanceDiff = {
  cashFrom: number;
  cashTo: number;
  cashDelta: number;
  items: StockRebalanceDiffItem[];
};

let nextDraftHoldingId = -1;

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

const sortSectors = (left: IStockPortfolioSectorSummary, right: IStockPortfolioSectorSummary) => {
  const leftIndex = SECTOR_ORDER.indexOf(left.sector);
  const rightIndex = SECTOR_ORDER.indexOf(right.sector);
  const resolvedLeftIndex = leftIndex === -1 ? SECTOR_ORDER.length : leftIndex;
  const resolvedRightIndex = rightIndex === -1 ? SECTOR_ORDER.length : rightIndex;
  return resolvedLeftIndex - resolvedRightIndex || left.sector.localeCompare(right.sector);
};

const emptyQuote = (holding: Pick<StockRebalanceCreateInput, 'symbol' | 'name' | 'currentPrice'>, userId = 0) => {
  const now = new Date();
  return {
    id: 0,
    userId,
    symbol: holding.symbol,
    name: holding.name,
    currentPrice: holding.currentPrice,
    createdAt: now,
    updatedAt: now,
  };
};

const findAccount = (accounts: StockAccount[], accountId: number) => accounts.find((account) => account.id === accountId) ?? null;

const buildAccountSummaries = (
  accounts: StockAccount[],
  holdings: StockRebalanceHolding[],
  totalAssetValue: number
): IStockPortfolioAccountSummary[] =>
  accounts.map((account) => {
    const accountHoldings = holdings.filter((holding) => holding.accountId === account.id && holding.quantity > 0);
    const marketValue = roundStockValue(accountHoldings.reduce((sum, holding) => sum + marketValueOf(holding), 0));
    return {
      accountId: account.id,
      name: account.name,
      marketValue,
      percent: percentOf(marketValue, totalAssetValue),
      holdingCount: accountHoldings.length,
    };
  });

const buildSymbolSummaries = (
  holdings: StockRebalanceHolding[],
  totalAssetValue: number,
  previousSummaries: IStockPortfolioSymbolSummary[]
): IStockPortfolioSymbolSummary[] => {
  const metadataBySymbol = new Map(previousSummaries.map((summary) => [summary.symbol, summary]));
  const bySymbol = new Map<string, IStockPortfolioSymbolSummary>();

  holdings.filter((holding) => holding.quantity > 0).forEach((holding) => {
    const metadata = metadataBySymbol.get(holding.symbol);
    const marketValue = marketValueOf(holding);
    const current = bySymbol.get(holding.symbol) ?? {
      ...metadata,
      symbol: holding.symbol,
      name: holding.name,
      sector: metadata?.sector ?? '其他',
      currentPrice: holding.currentPrice,
      quantity: 0,
      marketValue: 0,
      percent: 0,
      holdingCount: 0,
      accounts: [],
    };

    current.name = holding.name;
    current.currentPrice = holding.currentPrice;
    current.quantity = roundStockValue(current.quantity + holding.quantity);
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
      percent: percentOf(summary.marketValue, totalAssetValue),
    }))
    .sort((left, right) => {
      const leftIndex = previousSummaries.findIndex((summary) => summary.symbol === left.symbol);
      const rightIndex = previousSummaries.findIndex((summary) => summary.symbol === right.symbol);
      const resolvedLeftIndex = leftIndex === -1 ? previousSummaries.length : leftIndex;
      const resolvedRightIndex = rightIndex === -1 ? previousSummaries.length : rightIndex;
      return resolvedLeftIndex - resolvedRightIndex || left.symbol.localeCompare(right.symbol);
    });
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
    .sort(sortSectors);
};

export const recalculateRebalanceDraft = (
  draft: StockRebalanceDraft,
  previousSummaries = draft.symbolSummaries
): StockRebalanceDraft => {
  const totalMarketValue = roundStockValue(draft.holdings.reduce((sum, holding) => {
    if (holding.quantity <= 0) return sum;
    return sum + marketValueOf(holding);
  }, 0));
  const cashAmount = roundStockValue(draft.cashAmount);
  const totalAssetValue = roundStockValue(totalMarketValue + cashAmount);
  const symbolSummaries = buildSymbolSummaries(draft.holdings, totalAssetValue, previousSummaries);

  return {
    ...draft,
    cashAmount,
    totalMarketValue,
    totalAssetValue,
    cashPercent: percentOf(cashAmount, totalAssetValue),
    accountSummaries: buildAccountSummaries(draft.accounts, draft.holdings, totalAssetValue),
    symbolSummaries,
    sectorSummaries: buildSectorSummaries(symbolSummaries, totalAssetValue),
  };
};

export const buildRebalanceDraft = (data: IStockSearchRes): StockRebalanceDraft =>
  recalculateRebalanceDraft({
    ...data,
    symbolOrder: data.symbolSummaries.map((summary) => summary.symbol),
    holdings: data.holdings.map((holding) => ({
      ...holding,
      originalQuantity: holding.quantity,
    })),
  }, data.symbolSummaries);

export const applyRebalanceQuantityDelta = (
  draft: StockRebalanceDraft,
  holdingId: number,
  quantityDelta: number
) => {
  const holding = draft.holdings.find((item) => item.id === holdingId);
  if (!holding) return draft;

  const nextQuantity = Math.max(0, roundStockValue(holding.quantity + quantityDelta));
  const resolvedDelta = roundStockValue(nextQuantity - holding.quantity);
  if (resolvedDelta === 0) return draft;

  return recalculateRebalanceDraft({
    ...draft,
    cashAmount: roundStockValue(draft.cashAmount - resolvedDelta * holding.currentPrice),
    holdings: draft.holdings.map((item) =>
      item.id === holdingId
        ? { ...item, quantity: nextQuantity }
        : item
    ),
  });
};

export const createRebalanceHolding = (
  draft: StockRebalanceDraft,
  input: StockRebalanceCreateInput
) => {
  const symbol = normalizeSymbol(input.symbol);
  const account = findAccount(draft.accounts, input.accountId);
  const quantity = roundStockValue(Math.max(0, input.quantity));
  const currentPrice = roundStockValue(Math.max(0, input.currentPrice));
  const existingHolding = draft.holdings.find((holding) => holding.accountId === input.accountId && holding.symbol === symbol);

  if (!account || !symbol || !input.name.trim() || quantity <= 0) return draft;
  if (existingHolding) {
    return applyRebalanceQuantityDelta(draft, existingHolding.id, quantity);
  }

  const now = new Date();
  const newHolding: StockRebalanceHolding = {
    id: nextDraftHoldingId--,
    userId: account.userId,
    accountId: account.id,
    symbol,
    quantity,
    createdAt: now,
    updatedAt: now,
    account,
    quote: emptyQuote({ symbol, name: input.name.trim(), currentPrice }, account.userId),
    name: input.name.trim(),
    currentPrice,
    isDraft: true,
    originalQuantity: 0,
  };

  return recalculateRebalanceDraft({
    ...draft,
    cashAmount: roundStockValue(draft.cashAmount - quantity * currentPrice),
    holdings: [...draft.holdings, newHolding],
  });
};

export const buildRebalanceDiff = (base: IStockSearchRes, draft: StockRebalanceDraft): StockRebalanceDiff => {
  const items = draft.holdings
    .filter((holding) => holding.quantity !== holding.originalQuantity)
    .map((holding): StockRebalanceDiffItem => {
      const quantityDelta = roundStockValue(holding.quantity - holding.originalQuantity);
      return {
        key: `${holding.isDraft ? 'draft' : 'holding'}-${holding.id}`,
        accountName: holding.account.name,
        symbol: holding.symbol,
        name: holding.name,
        fromQuantity: holding.originalQuantity,
        toQuantity: holding.quantity,
        quantityDelta,
        cashImpact: roundStockValue(-quantityDelta * holding.currentPrice),
        type: holding.isDraft ? 'create' : holding.quantity <= 0 ? 'delete' : 'update',
      };
    });

  return {
    cashFrom: base.cashAmount,
    cashTo: draft.cashAmount,
    cashDelta: roundStockValue(draft.cashAmount - base.cashAmount),
    items,
  };
};

export const hasRebalanceChanges = (diff: StockRebalanceDiff) =>
  diff.items.length > 0 || roundStockValue(diff.cashDelta) !== 0;