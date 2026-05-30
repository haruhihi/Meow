import stockUniverseData from './stock-universe.json';

export type StockUniverseItem = {
  symbol: string;
  name: string;
  sector: string;
};

export const stockUniverse = stockUniverseData as StockUniverseItem[];

export const STOCK_SECTOR_ORDER = ['消费', '家电', '白酒', '红利', '中药', '医药', '其他'];

const stockUniverseBySymbol = new Map(stockUniverse.map((item) => [item.symbol, item]));

export const getStockUniverseItem = (symbol: string) => stockUniverseBySymbol.get(symbol.trim().toUpperCase()) ?? null;

export const getStockSector = (symbol: string) => getStockUniverseItem(symbol)?.sector ?? '其他';

export const getStockUniverseSymbols = () => stockUniverse.map((item) => item.symbol);

export const getStockUniverseSectors = () => [...new Set(stockUniverse.map((item) => item.sector))]
  .sort((left, right) => {
    const leftIndex = STOCK_SECTOR_ORDER.indexOf(left);
    const rightIndex = STOCK_SECTOR_ORDER.indexOf(right);
    const resolvedLeft = leftIndex === -1 ? STOCK_SECTOR_ORDER.length : leftIndex;
    const resolvedRight = rightIndex === -1 ? STOCK_SECTOR_ORDER.length : rightIndex;
    return resolvedLeft - resolvedRight || left.localeCompare(right);
  });
