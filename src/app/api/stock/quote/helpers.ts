import type { IStockQuoteRefreshItem } from '@dtos/meow';

const EASTMONEY_BATCH_SIZE = 40;
const FETCH_TIMEOUT_MS = 8000;

interface MarketSymbol {
  symbol: string;
  secid: string;
  sinaCode: string;
}

export const toMarketSymbol = (symbol: string): MarketSymbol | null => {
  const normalized = symbol.trim().toUpperCase();
  if (/^6\d{5}$/.test(normalized)) {
    return { symbol: normalized, secid: `1.${normalized}`, sinaCode: `sh${normalized}` };
  }
  if (/^[03]\d{5}$/.test(normalized)) {
    return { symbol: normalized, secid: `0.${normalized}`, sinaCode: `sz${normalized}` };
  }
  return null;
};

export const fetchRealtimeQuotes = async (symbols: string[]) => {
  const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const marketSymbols = uniqueSymbols.map(toMarketSymbol).filter((item): item is MarketSymbol => Boolean(item));
  const unsupportedSymbols = uniqueSymbols.filter((symbol) => !toMarketSymbol(symbol));

  const eastmoneyQuotes = await fetchEastmoneyQuotes(marketSymbols);
  const missingSymbols = marketSymbols
    .map((item) => item.symbol)
    .filter((symbol) => !eastmoneyQuotes.some((quote) => quote.symbol === symbol));

  const sinaQuotes = missingSymbols.length > 0
    ? await fetchSinaQuotes(marketSymbols.filter((item) => missingSymbols.includes(item.symbol)))
    : [];

  const quotesBySymbol = new Map<string, IStockQuoteRefreshItem>();
  eastmoneyQuotes.forEach((quote) => quotesBySymbol.set(quote.symbol, quote));
  sinaQuotes.forEach((quote) => quotesBySymbol.set(quote.symbol, quote));

  const quotes = [...quotesBySymbol.values()];
  const failedSymbols = [
    ...unsupportedSymbols,
    ...marketSymbols
      .map((item) => item.symbol)
      .filter((symbol) => !quotesBySymbol.has(symbol)),
  ];

  return { quotes, failedSymbols };
};

const fetchEastmoneyQuotes = async (marketSymbols: MarketSymbol[]): Promise<IStockQuoteRefreshItem[]> => {
  const quotes: IStockQuoteRefreshItem[] = [];

  for (let index = 0; index < marketSymbols.length; index += EASTMONEY_BATCH_SIZE) {
    const batch = marketSymbols.slice(index, index + EASTMONEY_BATCH_SIZE);
    const url = new URL('https://push2.eastmoney.com/api/qt/ulist/get');
    url.searchParams.set('fltt', '2');
    url.searchParams.set('invt', '2');
    url.searchParams.set('fields', 'f12,f14,f2');
    url.searchParams.set('secids', batch.map((item) => item.secid).join(','));

    try {
      const json = await fetchTextWithTimeout(url.toString());
      const data = parseEastmoneyResponse(json);
      data.forEach((quote) => quotes.push(quote));
    } catch (error) {
      console.log('Eastmoney quote batch failed', error);
    }
  }

  return quotes;
};

const parseEastmoneyResponse = (text: string): IStockQuoteRefreshItem[] => {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith('{')
    ? trimmed
    : trimmed.replace(/^[^(]*\(/, '').replace(/\);?$/, '');
  const payload = JSON.parse(jsonText) as {
    data?: {
      diff?: Array<{ f12?: string; f14?: string; f2?: number | string }>;
    } | null;
  };

  const diff = payload.data?.diff ?? [];
  return diff
    .map((item): IStockQuoteRefreshItem | null => {
      const symbol = String(item.f12 ?? '').trim().toUpperCase();
      const currentPrice = Number(item.f2);
      if (!symbol || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;
      return {
        symbol,
        name: String(item.f14 ?? symbol).trim() || symbol,
        currentPrice,
        source: 'eastmoney' as const,
      };
    })
    .filter((item): item is IStockQuoteRefreshItem => Boolean(item));
};

const fetchSinaQuotes = async (marketSymbols: MarketSymbol[]): Promise<IStockQuoteRefreshItem[]> => {
  if (marketSymbols.length === 0) return [];

  const url = `https://hq.sinajs.cn/list=${marketSymbols.map((item) => item.sinaCode).join(',')}`;
  try {
    const text = await fetchTextWithTimeout(url, {
      Referer: 'https://finance.sina.com.cn/',
    });
    return parseSinaResponse(text);
  } catch (error) {
    console.log('Sina quote fallback failed', error);
    return [];
  }
};

const parseSinaResponse = (text: string): IStockQuoteRefreshItem[] => {
  const quotes: IStockQuoteRefreshItem[] = [];
  const regex = /var hq_str_(sh|sz)(\d{6})="([^"]*)";/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const symbol = match[2];
    const fields = match[3].split(',');
    const currentPrice = Number(fields[3]);
    if (!symbol || !Number.isFinite(currentPrice) || currentPrice <= 0) continue;
    quotes.push({
      symbol,
      currentPrice,
      source: 'sina',
    });
  }

  return quotes;
};

const fetchTextWithTimeout = async (url: string, headers: Record<string, string> = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://quote.eastmoney.com/',
        ...headers,
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`quote fetch failed: ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
};
