import type { IStockPortfolioSymbolSummary } from '@dtos/meow';

export const roundStockValue = (value: number) => Math.round(value * 100) / 100;

export const marketValueOf = (holding: { quantity: number; currentPrice: number }) =>
  roundStockValue(holding.quantity * holding.currentPrice);

export const percentOf = (value: number, total: number) => (total > 0 ? value / total : 0);

export const calculateExpectedDividend = (symbols: Pick<IStockPortfolioSymbolSummary, 'marketValue' | 'normalizedDividendYield'>[]) =>
  roundStockValue(symbols.reduce((sum, summary) => sum + summary.marketValue * (summary.normalizedDividendYield ?? 0), 0));

export const calculatePortfolioDividendYield = (totalMarketValue: number, expectedDividend: number) =>
  totalMarketValue > 0 ? expectedDividend / totalMarketValue : 0;

export const formatStockQuantity = (value: number) => Number(value.toFixed(4)).toString();