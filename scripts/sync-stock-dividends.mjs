#!/usr/bin/env node

import crypto from 'node:crypto';
import { setAppDatabaseUrl } from './database-url.mjs';
import { PrismaClient } from '@prisma/client';

const SOURCE = 'xueqiu';
const APP_PAGE = 'https://xueqiu.com/snowman/S/{symbol}/detail#/FHPS';
const BONUS_URL = 'https://stock.xueqiu.com/v5/stock/f10/cn/bonus.json';

setAppDatabaseUrl();

const prisma = new PrismaClient();

const toXueqiuSymbol = (symbol) => (symbol.startsWith('6') ? `SH${symbol}` : `SZ${symbol}`);

const parseArgs = () => {
  const args = process.argv.slice(2);
  const symbols = [];
  let limit = 0;
  let dryRun = false;
  let sleep = 800;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--symbols') {
      while (args[index + 1] && !args[index + 1].startsWith('--')) {
        symbols.push(args[index + 1].trim().toUpperCase());
        index += 1;
      }
    } else if (arg === '--limit') {
      limit = Number(args[index + 1] ?? 0);
      index += 1;
    } else if (arg === '--sleep') {
      sleep = Number(args[index + 1] ?? sleep);
      index += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return { symbols: symbols.filter(Boolean), limit, dryRun, sleep };
};

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchSymbols = async (explicitSymbols) => {
  if (explicitSymbols.length > 0) return [...new Set(explicitSymbols)].sort();
  const rows = await prisma.stockHolding.findMany({
    distinct: ['symbol'],
    select: { symbol: true },
    orderBy: { symbol: 'asc' },
  });
  return rows.map((row) => row.symbol);
};

const createXueqiuSession = async (xueqiuSymbol) => {
  const cookies = new Map();
  const pageUrl = APP_PAGE.replace('{symbol}', xueqiuSymbol);
  const response = await fetch(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: `https://xueqiu.com/S/${xueqiuSymbol}` },
  });
  response.headers.getSetCookie?.().forEach((cookie) => {
    const [pair] = cookie.split(';');
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex > 0) cookies.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
  });
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
};

const fetchXueqiuBonus = async (symbol, size = 30) => {
  const xueqiuSymbol = toXueqiuSymbol(symbol);
  const cookieHeader = await createXueqiuSession(xueqiuSymbol);
  if (!cookieHeader) throw new Error('missing xueqiu anonymous cookie');

  const url = new URL(BONUS_URL);
  url.searchParams.set('symbol', xueqiuSymbol);
  url.searchParams.set('size', String(size));
  url.searchParams.set('page', '1');
  url.searchParams.set('extend', 'true');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: `https://xueqiu.com/S/${xueqiuSymbol}`,
      Cookie: cookieHeader,
    },
  });
  if (!response.ok) throw new Error(`xueqiu http ${response.status}`);
  const payload = await response.json();
  if (payload.error_code && payload.error_code !== 0) {
    throw new Error(`xueqiu error ${payload.error_code}: ${payload.error_description ?? ''}`);
  }
  return payload.data?.items ?? [];
};

const dateFromMillis = (value) => {
  if (value == null) return null;
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateFromLabel = (value) => {
  const text = String(value ?? '');
  let match = text.match(/(20\d{2}).*年报/);
  if (match) return new Date(`${match[1]}-12-31T00:00:00.000Z`);
  match = text.match(/(20\d{2}).*三季/);
  if (match) return new Date(`${match[1]}-09-30T00:00:00.000Z`);
  match = text.match(/(20\d{2}).*中报/);
  if (match) return new Date(`${match[1]}-06-30T00:00:00.000Z`);
  match = text.match(/(20\d{2}).*一季/);
  if (match) return new Date(`${match[1]}-03-31T00:00:00.000Z`);
  match = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) return new Date(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}T00:00:00.000Z`);
  return null;
};

const parseNumber = (text, regex) => {
  const match = String(text ?? '').match(regex);
  return match ? Number(match[1]) : null;
};

const buildEventKey = (symbol, eventDate, description) => {
  const digest = crypto.createHash('md5').update(description ?? '').digest('hex').slice(0, 12);
  return `${symbol}:${eventDate.toISOString().slice(0, 10)}:${digest}`;
};

const parseDividendItem = (symbol, item) => {
  const description = String(item.plan_explain ?? '').trim();
  const cashPerTen = parseNumber(description, /10\s*派\s*(\d+(?:\.\d+)?)/);
  const bonusSharesPerTen = parseNumber(description, /10\s*送\s*(\d+(?:\.\d+)?)/);
  const transferSharesPerTen = parseNumber(description, /10\s*转\s*(\d+(?:\.\d+)?)/);
  if (cashPerTen == null && bonusSharesPerTen == null && transferSharesPerTen == null) return null;

  const exDividendDate = dateFromMillis(item.ashare_ex_dividend_date ?? item.ex_dividend_date);
  const recordDate = dateFromMillis(item.equity_date);
  const paymentDate = dateFromMillis(item.dividend_date);
  const announcementDate = dateFromLabel(item.dividend_year);
  const eventDate = exDividendDate ?? announcementDate ?? recordDate ?? paymentDate;
  if (!eventDate) return null;

  const status = description.match(/\(([^)）]+)[)）]/)?.[1] ?? null;
  return {
    eventKey: buildEventKey(symbol, eventDate, description || String(item.dividend_year ?? '')),
    symbol,
    announcementDate,
    recordDate,
    exDividendDate,
    paymentDate,
    cashPerTen,
    bonusSharesPerTen,
    transferSharesPerTen,
    dividendBaseShares: null,
    status,
    description,
    source: SOURCE,
  };
};

const fetchDividendEvents = async (symbol) => {
  const items = await fetchXueqiuBonus(symbol);
  return items.map((item) => parseDividendItem(symbol, item)).filter(Boolean);
};

const upsertDividendEvent = async (event) => {
  await prisma.stockDividendEvent.upsert({
    where: { eventKey: event.eventKey },
    create: event,
    update: {
      announcementDate: event.announcementDate,
      recordDate: event.recordDate,
      exDividendDate: event.exDividendDate,
      paymentDate: event.paymentDate,
      cashPerTen: event.cashPerTen,
      bonusSharesPerTen: event.bonusSharesPerTen,
      transferSharesPerTen: event.transferSharesPerTen,
      dividendBaseShares: event.dividendBaseShares,
      status: event.status,
      description: event.description,
      source: event.source,
      fetchedAt: new Date(),
    },
  });
};

const main = async () => {
  const args = parseArgs();
  let symbols = await fetchSymbols(args.symbols);
  if (args.limit > 0) symbols = symbols.slice(0, args.limit);
  console.log(`syncing dividends for ${symbols.length} symbols: ${symbols.join(', ')}`);

  let ok = 0;
  let written = 0;
  const failed = [];
  for (const symbol of symbols) {
    try {
      const events = await fetchDividendEvents(symbol);
      if (events.length === 0) {
        failed.push(symbol);
        console.error(`[${symbol}] no dividend events`);
        continue;
      }
      for (const event of events) {
        console.log(`[${symbol}] ex=${event.exDividendDate?.toISOString().slice(0, 10) ?? 'N/A'} announcement=${event.announcementDate?.toISOString().slice(0, 10) ?? 'N/A'} cash10=${event.cashPerTen} bonus10=${event.bonusSharesPerTen} transfer10=${event.transferSharesPerTen} status=${event.status}`);
        if (!args.dryRun) await upsertDividendEvent(event);
        written += 1;
      }
      ok += 1;
    } catch (error) {
      failed.push(symbol);
      console.error(`[${symbol}] failed: ${error instanceof Error ? error.message : error}`);
    }
    if (args.sleep > 0) await sleepMs(args.sleep);
  }

  console.log(`done ok=${ok} written=${written} failed=${failed.length} failedSymbols=${failed.join(',')}`);
  return ok > 0 || failed.length === 0 ? 0 : 1;
};

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
