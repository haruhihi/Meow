import { prisma } from '@libs/prisma';
import { fail, success } from '@libs/fetch';
import { getUID } from '@libs/session';
import {
  IStockMagicFormulaItem,
  IStockMagicFormulaMetric,
  IStockMagicFormulaSearchReq,
  IStockMagicFormulaSearchRes,
} from '@dtos/meow';
import {
  getStockSector,
  getStockUniverseItem,
  getStockUniverseSectors,
  stockUniverse,
} from '../../../../../config/stock-universe';
import type { StockDividendEvent, StockFinancialStatement, StockFundamental, StockHolding, StockMetricOverride, StockQuote } from '@prisma/client';

const ALL_SECTOR = '全部关注';
const EXCLUDING_DIVIDEND_SECTOR = '除红利';
const DIVIDEND_SECTOR = '红利';

type MetricDefinition = {
  key: IStockMagicFormulaMetric['key'];
  label: string;
  direction: 'asc' | 'desc';
  getValue: (item: ScoreInput) => number | null;
  format: (value: number | null) => string;
};

type ScoreInput = {
  symbol: string;
  name: string;
  sector: string;
  isHeld: boolean;
  currentPrice: number | null;
  marketValue: number;
  percent: number;
  fundamental: StockFundamental | null;
  annualFundamentals: StockFundamental[];
  annualBalance: Pick<StockFinancialStatement, 'fields'> | null;
  override: StockMetricOverride | null;
  dividendEvents: StockDividendEvent[];
};

const formatNumber = (value: number | null) => (value == null ? '—' : value.toFixed(1));
const formatPercent = (value: number | null) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`);
const roundStockValue = (value: number) => Math.round(value * 100) / 100;
const percentOf = (value: number, total: number) => total > 0 ? value / total : 0;

const readStatementNumber = (fields: unknown, key: string) => {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  const value = (fields as Record<string, unknown>)[key];
  const raw = Array.isArray(value) ? value[0] : value;
  const numberValue = typeof raw === 'number' ? raw : Number(raw ?? Number.NaN);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const readMarketCap = (item: ScoreInput) => {
  const totalShares = item.fundamental?.totalShares;
  return item.currentPrice != null && totalShares && totalShares > 0 ? item.currentPrice * totalShares : null;
};

const readGoodwill = (item: ScoreInput) => item.annualBalance ? readStatementNumber(item.annualBalance.fields, 'goodwill') ?? 0 : null;

const readDeductedNetProfitCagr5 = (item: ScoreInput) => {
  const latestAnnual = item.annualFundamentals[0];
  if (!latestAnnual) return null;
  const annualsByYear = new Map(item.annualFundamentals.map((fundamental) => [fundamental.reportDate.getFullYear(), fundamental]));
  const baseAnnual = annualsByYear.get(latestAnnual.reportDate.getFullYear() - 5);
  return latestAnnual.deductedNetProfit && latestAnnual.deductedNetProfit > 0 && baseAnnual?.deductedNetProfit && baseAnnual.deductedNetProfit > 0
    ? (latestAnnual.deductedNetProfit / baseAnnual.deductedNetProfit) ** (1 / 5) - 1
    : null;
};

const readDeductedPe = (item: ScoreInput) => {
  const marketCap = readMarketCap(item);
  const profit = item.fundamental?.deductedNetProfit;
  return marketCap != null && profit && profit > 0 ? marketCap / profit : null;
};

const readDeductedRoe = (item: ScoreInput) => {
  const netAsset = item.fundamental?.netAsset;
  const profit = item.fundamental?.deductedNetProfitTtm ?? item.fundamental?.deductedNetProfit;
  return profit != null && netAsset && netAsset > 0 ? profit / netAsset : null;
};

const readDeductedRoa = (item: ScoreInput) => {
  const totalAssets = item.fundamental?.totalAssets;
  const profit = item.fundamental?.deductedNetProfitTtm ?? item.fundamental?.deductedNetProfit;
  return profit != null && totalAssets && totalAssets > 0 ? profit / totalAssets : null;
};

const readDeductedPeg = (item: ScoreInput) => {
  const pe = readDeductedPe(item);
  const cagr = readDeductedNetProfitCagr5(item);
  return pe != null && cagr != null && cagr > 0 ? pe / (cagr * 100) : null;
};

const readOperatingCashFlowToDeductedNetProfit = (item: ScoreInput) => {
  const operatingCashFlow = item.fundamental?.operatingCashFlowTtm;
  const profit = item.fundamental?.deductedNetProfitTtm;
  return operatingCashFlow != null && profit && profit > 0 ? operatingCashFlow / profit : null;
};

const readGoodwillToNetAsset = (item: ScoreInput) => {
  const goodwill = readGoodwill(item);
  const netAsset = item.fundamental?.netAsset;
  return goodwill != null && netAsset && netAsset > 0 ? goodwill / netAsset : null;
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

const dividendEventDedupeKey = (event: Pick<StockDividendEvent, 'symbol' | 'reportPeriod' | 'cashPerTen' | 'bonusSharesPerTen' | 'transferSharesPerTen'>) => [
  event.symbol,
  event.reportPeriod ?? '',
  event.cashPerTen ?? 0,
  event.bonusSharesPerTen ?? 0,
  event.transferSharesPerTen ?? 0,
].join('|');

const readDividendYield = (item: ScoreInput) => {
  const marketCap = readMarketCap(item);
  const normalizedDividend = sumMarkedDividendEvents(item.dividendEvents, item.fundamental?.totalShares ?? null) ?? item.override?.normalizedDividend ?? null;
  return marketCap != null && normalizedDividend != null && normalizedDividend > 0 ? normalizedDividend / marketCap : null;
};

const metricDefinitions: MetricDefinition[] = [
  { key: 'deductedPe', label: '扣非 PE', direction: 'asc', getValue: readDeductedPe, format: formatNumber },
  { key: 'deductedRoe', label: '扣非 ROE', direction: 'desc', getValue: readDeductedRoe, format: formatPercent },
  { key: 'deductedRoa', label: '扣非 ROA', direction: 'desc', getValue: readDeductedRoa, format: formatPercent },
  { key: 'dividendYield', label: '股息率', direction: 'desc', getValue: readDividendYield, format: formatPercent },
  { key: 'deductedPeg', label: '扣非 PEG', direction: 'asc', getValue: readDeductedPeg, format: formatNumber },
];

const buildFlags = (item: ScoreInput) => {
  const cagr = readDeductedNetProfitCagr5(item);
  const goodwillToNetAsset = readGoodwillToNetAsset(item);
  const cashQuality = readOperatingCashFlowToDeductedNetProfit(item);
  return [
    item.currentPrice == null ? '缺行情' : null,
    !item.fundamental ? '缺财报' : null,
    goodwillToNetAsset != null && goodwillToNetAsset >= 0.1 ? `商誉 ${formatPercent(goodwillToNetAsset)}` : null,
    cashQuality != null && cashQuality < 0.8 ? `含金量 ${formatNumber(cashQuality)}` : null,
    cagr != null && cagr <= 0 ? `扣非增长 ${formatPercent(cagr)}` : null,
  ].filter((flag): flag is string => Boolean(flag));
};

const toMagicFormulaItem = (
  item: ScoreInput
): IStockMagicFormulaItem => {
  const metrics = metricDefinitions.map((definition) => {
    const value = definition.getValue(item);
    return {
      key: definition.key,
      label: definition.label,
      direction: definition.direction,
      value,
      display: definition.format(value),
    };
  });
  const cagr = readDeductedNetProfitCagr5(item);
  const goodwillToNetAsset = readGoodwillToNetAsset(item);
  const cashQuality = readOperatingCashFlowToDeductedNetProfit(item);

  return {
    symbol: item.symbol,
    name: item.name,
    sector: item.sector,
    isHeld: item.isHeld,
    currentPrice: item.currentPrice,
    marketValue: item.marketValue,
    percent: item.percent,
    metrics,
    flags: buildFlags(item),
    reportName: item.fundamental?.reportName ?? null,
    reportDate: item.fundamental?.reportDate.toISOString() ?? null,
    deductedNetProfitCagr5: cagr,
    goodwillToNetAsset,
    operatingCashFlowToDeductedNetProfit: cashQuality,
    fcfDividendCoverage: null,
  };
};

const buildUniverseSymbols = (holdings: Pick<StockHolding, 'symbol'>[]) => {
  const map = new Map(stockUniverse.map((item) => [item.symbol, item]));
  holdings.forEach((holding) => {
    if (!map.has(holding.symbol)) {
      map.set(holding.symbol, {
        symbol: holding.symbol,
        name: holding.symbol,
        sector: getStockSector(holding.symbol),
      });
    }
  });
  return [...map.values()].sort((left, right) => left.sector.localeCompare(right.sector) || left.symbol.localeCompare(right.symbol));
};

const matchSelectedSector = (item: { sector: string }, selectedSector: string) => {
  if (selectedSector === ALL_SECTOR) return true;
  if (selectedSector === EXCLUDING_DIVIDEND_SECTOR) return item.sector !== DIVIDEND_SECTOR;
  return item.sector === selectedSector;
};

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json().catch(() => ({}))) as IStockMagicFormulaSearchReq;
    const selectedSector = body.sector?.trim() || ALL_SECTOR;
    const holdings = await prisma.stockHolding.findMany({
      where: { userId: uid },
      select: { symbol: true, quantity: true },
    });
    const universeItems = buildUniverseSymbols(holdings);
    const symbols = universeItems.map((item) => item.symbol);
    const quotes = await prisma.stockQuote.findMany({
      where: { userId: uid, symbol: { in: symbols } },
    });
    const fundamentals = await prisma.stockFundamental.findMany({
      where: { symbol: { in: symbols } },
      orderBy: [{ symbol: 'asc' }, { reportDate: 'desc' }],
    });
    const balanceStatements = await prisma.stockFinancialStatement.findMany({
      where: { symbol: { in: symbols }, statement: 'balance', reportName: { contains: '年报' } },
      orderBy: [{ symbol: 'asc' }, { reportDate: 'desc' }],
    });
    const overrides = await prisma.stockMetricOverride.findMany({
      where: { userId: uid, symbol: { in: symbols } },
    });
    const markedDividends = await prisma.stockDividendMarking.findMany({
      where: { userId: uid, countTowardNormalizedDividend: true, event: { symbol: { in: symbols } } },
      include: { event: true },
    });

    const quoteBySymbol = new Map<string, StockQuote>(quotes.map((quote) => [quote.symbol, quote]));
    const overrideBySymbol = new Map(overrides.map((override) => [override.symbol, override]));
    const holdingsBySymbol = new Map<string, number>();
    holdings.forEach((holding) => holdingsBySymbol.set(holding.symbol, (holdingsBySymbol.get(holding.symbol) ?? 0) + holding.quantity));
    const latestFundamentalBySymbol = new Map<string, StockFundamental>();
    const annualFundamentalsBySymbol = new Map<string, StockFundamental[]>();
    fundamentals.forEach((fundamental) => {
      if (!latestFundamentalBySymbol.has(fundamental.symbol)) latestFundamentalBySymbol.set(fundamental.symbol, fundamental);
      if (fundamental.reportName?.includes('年报')) {
        const annuals = annualFundamentalsBySymbol.get(fundamental.symbol) ?? [];
        annuals.push(fundamental);
        annualFundamentalsBySymbol.set(fundamental.symbol, annuals);
      }
    });
    const annualBalanceBySymbol = new Map<string, Pick<StockFinancialStatement, 'fields'>>();
    balanceStatements.forEach((statement) => {
      if (!annualBalanceBySymbol.has(statement.symbol)) annualBalanceBySymbol.set(statement.symbol, { fields: statement.fields });
    });
    const dividendEventsBySymbol = new Map<string, StockDividendEvent[]>();
    markedDividends.forEach((marking) => {
      const current = dividendEventsBySymbol.get(marking.event.symbol) ?? [];
      current.push(marking.event);
      dividendEventsBySymbol.set(marking.event.symbol, current);
    });

    const totalHeldMarketValue = roundStockValue(universeItems.reduce((sum, item) => {
      const quote = quoteBySymbol.get(item.symbol);
      return sum + (quote ? (holdingsBySymbol.get(item.symbol) ?? 0) * quote.currentPrice : 0);
    }, 0));

    const scoreInputs = universeItems
      .filter((item) => matchSelectedSector(item, selectedSector))
      .map((item): ScoreInput => {
        const quote = quoteBySymbol.get(item.symbol);
        const quantity = holdingsBySymbol.get(item.symbol) ?? 0;
        const marketValue = quote ? roundStockValue(quantity * quote.currentPrice) : 0;
        const universeItem = getStockUniverseItem(item.symbol);
        return {
          symbol: item.symbol,
          name: quote?.name ?? universeItem?.name ?? item.name,
          sector: item.sector,
          isHeld: quantity > 0,
          currentPrice: quote?.currentPrice ?? null,
          marketValue,
          percent: percentOf(marketValue, totalHeldMarketValue),
          fundamental: latestFundamentalBySymbol.get(item.symbol) ?? null,
          annualFundamentals: annualFundamentalsBySymbol.get(item.symbol) ?? [],
          annualBalance: annualBalanceBySymbol.get(item.symbol) ?? null,
          override: overrideBySymbol.get(item.symbol) ?? null,
          dividendEvents: dividendEventsBySymbol.get(item.symbol) ?? [],
        };
      });

    return success<IStockMagicFormulaSearchRes>({
      selectedSector,
      sectors: [ALL_SECTOR, EXCLUDING_DIVIDEND_SECTOR, ...getStockUniverseSectors()],
      items: scoreInputs.map(toMagicFormulaItem),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return fail(error);
  }
}
