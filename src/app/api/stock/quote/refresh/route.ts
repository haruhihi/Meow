import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockQuoteRefreshReq, IStockQuoteRefreshRes } from '@dtos/meow';
import { fetchRealtimeQuotes } from '../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json().catch(() => ({}))) as IStockQuoteRefreshReq;
    const requestedSymbols = body.symbols?.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
    const holdings = await prisma.stockHolding.findMany({
      where: {
        userId: uid,
        ...(requestedSymbols?.length ? { symbol: { in: requestedSymbols } } : {}),
      },
      distinct: ['symbol'],
      select: { symbol: true },
    });
    const symbols = holdings.map((holding) => holding.symbol);

    if (symbols.length === 0) {
      return success<IStockQuoteRefreshRes>({
        updated: 0,
        failedSymbols: [],
        quotes: [],
        source: 'eastmoney',
        fetchedAt: new Date().toISOString(),
      });
    }

    const { quotes, failedSymbols } = await fetchRealtimeQuotes(symbols);
    const existingQuotes = await prisma.stockQuote.findMany({
      where: { userId: uid, symbol: { in: quotes.map((quote) => quote.symbol) } },
    });
    const existingQuoteBySymbol = new Map(existingQuotes.map((quote) => [quote.symbol, quote]));

    if (quotes.length > 0) {
      await prisma.$transaction(
        quotes.map((quote) => {
          const existingQuote = existingQuoteBySymbol.get(quote.symbol);
          return prisma.stockQuote.upsert({
            where: { userId_symbol: { userId: uid, symbol: quote.symbol } },
            create: {
              userId: uid,
              symbol: quote.symbol,
              name: quote.name ?? quote.symbol,
              currentPrice: quote.currentPrice,
            },
            update: {
              name: quote.name ?? existingQuote?.name ?? quote.symbol,
              currentPrice: quote.currentPrice,
            },
          });
        })
      );
    }

    const sources = new Set(quotes.map((quote) => quote.source));
    const source = sources.size > 1 ? 'mixed' : sources.has('sina') ? 'sina' : 'eastmoney';

    return success<IStockQuoteRefreshRes>({
      updated: quotes.length,
      failedSymbols,
      quotes,
      source,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return fail(error);
  }
}
