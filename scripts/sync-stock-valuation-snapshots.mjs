#!/usr/bin/env node

import { setAppDatabaseUrl } from './database-url.mjs';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

const SOURCE = 'tushare';
const PERIOD = 'WEEK';
const DEFAULT_START_DATE = '20150101';
const TUSHARE_API_URL = 'http://api.tushare.pro';
const STOCK_UNIVERSE_PATH = new URL('../src/config/stock-universe.json', import.meta.url);

class TushareTokenError extends Error {}

const isTushareTokenError = (error) => error instanceof TushareTokenError;

const isTushareTokenPayload = (payload) => {
  const message = String(payload?.msg ?? '').toLowerCase();
  return payload?.code === -2001 || /token|权限|过期|失效|无效|expired|invalid|unauthorized/.test(message);
};

setAppDatabaseUrl();

const prisma = new PrismaClient();

const parseArgs = () => {
  const args = process.argv.slice(2);
  const symbols = [];
  let startDate = DEFAULT_START_DATE;
  let endDate = formatTushareDate(new Date());
  let limit = 0;
  let sleep = 300;
  let dryRun = false;
  let allAShare = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--symbols') {
      while (args[index + 1] && !args[index + 1].startsWith('--')) {
        symbols.push(args[index + 1].trim().toUpperCase());
        index += 1;
      }
    } else if (arg === '--start-date') {
      startDate = normalizeTushareDate(args[index + 1] ?? startDate);
      index += 1;
    } else if (arg === '--end-date') {
      endDate = normalizeTushareDate(args[index + 1] ?? endDate);
      index += 1;
    } else if (arg === '--limit') {
      limit = Number(args[index + 1] ?? 0);
      index += 1;
    } else if (arg === '--sleep') {
      sleep = Number(args[index + 1] ?? sleep);
      index += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--all-a-share') {
      allAShare = true;
    }
  }

  return {
    symbols: symbols.filter(Boolean),
    startDate,
    endDate,
    limit,
    sleep: Number.isFinite(sleep) ? Math.max(0, sleep) : 300,
    dryRun,
    allAShare,
  };
};

function normalizeTushareDate(value) {
  const text = String(value ?? '').trim().replaceAll('-', '');
  if (!/^\d{8}$/.test(text)) throw new Error(`invalid Tushare date: ${value}`);
  return text;
}

function formatTushareDate(date) {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadStockUniverseSymbols = () => {
  const text = readFileSync(STOCK_UNIVERSE_PATH, 'utf8');
  const items = JSON.parse(text);
  return Array.isArray(items)
    ? items.map((item) => String(item?.symbol ?? '').trim().toUpperCase()).filter(Boolean)
    : [];
};

const toTsCode = (symbol) => {
  const text = String(symbol ?? '').trim().toUpperCase();
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(text)) return text;
  if (!/^\d{6}$/.test(text)) throw new Error(`invalid A-share symbol: ${symbol}`);
  if (text.startsWith('6')) return `${text}.SH`;
  if (text.startsWith('0') || text.startsWith('2') || text.startsWith('3')) return `${text}.SZ`;
  return `${text}.BJ`;
};

const fromTsCode = (tsCode) => String(tsCode ?? '').split('.')[0];

const fetchTushare = async (apiName, params, fields) => {
  const token = process.env.TUSHARE_TOKEN;
  if (!token) throw new TushareTokenError('TUSHARE_TOKEN is required');

  const response = await fetch(TUSHARE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_name: apiName,
      token,
      params,
      fields: fields.join(','),
    }),
  });
  if (!response.ok) throw new Error(`tushare http ${response.status}`);

  const payload = await response.json();
  if (payload.code !== 0) {
    const message = `tushare ${apiName} error ${payload.code}: ${payload.msg ?? ''}`;
    if (isTushareTokenPayload(payload)) throw new TushareTokenError(message);
    throw new Error(message);
  }

  const responseFields = payload.data?.fields ?? [];
  const items = payload.data?.items ?? [];
  return items.map((item) => Object.fromEntries(responseFields.map((field, index) => [field, item[index]])));
};

const fetchAllAShareSymbols = async () => {
  const rows = await fetchTushare('stock_basic', { list_status: 'L' }, ['ts_code', 'symbol', 'name', 'list_status']);
  return rows.map((row) => String(row.symbol ?? fromTsCode(row.ts_code)).trim().toUpperCase()).filter(Boolean).sort();
};

const fetchSymbols = async (args) => {
  if (args.symbols.length > 0) return [...new Set(args.symbols)].sort();
  if (args.allAShare) return [...new Set(await fetchAllAShareSymbols())].sort();

  const rows = await prisma.stockHolding.findMany({
    distinct: ['symbol'],
    select: { symbol: true },
    orderBy: { symbol: 'asc' },
  });
  return [...new Set([...rows.map((row) => row.symbol), ...loadStockUniverseSymbols()])].sort();
};

const dateFromTushare = (value) => {
  const text = normalizeTushareDate(value);
  return new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00.000Z`);
};

const numberOrNull = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const multiplyOrNull = (value, factor) => {
  const number = numberOrNull(value);
  return number == null ? null : number * factor;
};

const fetchWeeklyRows = (tsCode, startDate, endDate) => fetchTushare(
  'weekly',
  { ts_code: tsCode, start_date: startDate, end_date: endDate },
  ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'vol', 'amount'],
);

const fetchDailyBasicRows = (tsCode, startDate, endDate) => fetchTushare(
  'daily_basic',
  { ts_code: tsCode, start_date: startDate, end_date: endDate },
  ['ts_code', 'trade_date', 'close', 'pe', 'pe_ttm', 'pb', 'dv_ratio', 'dv_ttm', 'total_share', 'float_share', 'free_share', 'total_mv', 'circ_mv'],
);

const fetchAdjFactorRows = (tsCode, startDate, endDate) => fetchTushare(
  'adj_factor',
  { ts_code: tsCode, start_date: startDate, end_date: endDate },
  ['ts_code', 'trade_date', 'adj_factor'],
);

const buildSnapshots = (symbol, weeklyRows, dailyBasicRows, adjFactorRows) => {
  const basicByDate = new Map(dailyBasicRows.map((row) => [String(row.trade_date), row]));
  const adjFactorByDate = new Map(adjFactorRows.map((row) => [String(row.trade_date), row]));

  return weeklyRows
    .slice()
    .sort((left, right) => String(left.trade_date).localeCompare(String(right.trade_date)))
    .map((weekly) => {
      const basic = basicByDate.get(String(weekly.trade_date));
      if (!basic) return null;

      const tradeDate = dateFromTushare(weekly.trade_date);
      const totalMarketCap = multiplyOrNull(basic.total_mv, 10000);

      return {
        symbol,
        period: PERIOD,
        tradeDate,
        close: numberOrNull(weekly.close) ?? numberOrNull(basic.close),
        totalMarketCap,
        circulatingMarketCap: multiplyOrNull(basic.circ_mv, 10000),
        totalShares: multiplyOrNull(basic.total_share, 10000),
        floatShares: multiplyOrNull(basic.float_share, 10000),
        freeShares: multiplyOrNull(basic.free_share, 10000),
        adjFactor: numberOrNull(adjFactorByDate.get(String(weekly.trade_date))?.adj_factor),
        pe: numberOrNull(basic.pe),
        peTtm: numberOrNull(basic.pe_ttm),
        pb: numberOrNull(basic.pb),
        dividendYield: numberOrNull(basic.dv_ratio),
        dividendYieldTtm: numberOrNull(basic.dv_ttm),
        source: SOURCE,
      };
    })
    .filter(Boolean);
};

const upsertSnapshot = async (snapshot) => {
  await prisma.stockValuationSnapshot.upsert({
    where: {
      symbol_period_tradeDate: {
        symbol: snapshot.symbol,
        period: snapshot.period,
        tradeDate: snapshot.tradeDate,
      },
    },
    create: snapshot,
    update: {
      close: snapshot.close,
      totalMarketCap: snapshot.totalMarketCap,
      circulatingMarketCap: snapshot.circulatingMarketCap,
      totalShares: snapshot.totalShares,
      floatShares: snapshot.floatShares,
      freeShares: snapshot.freeShares,
      adjFactor: snapshot.adjFactor,
      pe: snapshot.pe,
      peTtm: snapshot.peTtm,
      pb: snapshot.pb,
      dividendYield: snapshot.dividendYield,
      dividendYieldTtm: snapshot.dividendYieldTtm,
      source: snapshot.source,
      fetchedAt: new Date(),
    },
  });
};

const syncSymbol = async (symbol, args) => {
  const tsCode = toTsCode(symbol);
  const [weeklyRows, dailyBasicRows, adjFactorRows] = await Promise.all([
    fetchWeeklyRows(tsCode, args.startDate, args.endDate),
    fetchDailyBasicRows(tsCode, args.startDate, args.endDate),
    fetchAdjFactorRows(tsCode, args.startDate, args.endDate),
  ]);
  const snapshots = buildSnapshots(symbol, weeklyRows, dailyBasicRows, adjFactorRows);
  if (!args.dryRun) {
    for (const snapshot of snapshots) await upsertSnapshot(snapshot);
  }
  return { weeklyRows: weeklyRows.length, dailyBasicRows: dailyBasicRows.length, adjFactorRows: adjFactorRows.length, snapshots: snapshots.length };
};

const main = async () => {
  const args = parseArgs();
  let symbols = await fetchSymbols(args);
  if (args.limit > 0) symbols = symbols.slice(0, args.limit);

  console.log(`syncing valuation snapshots period=${PERIOD} start=${args.startDate} end=${args.endDate} symbols=${symbols.length}`);

  let ok = 0;
  let written = 0;
  const failed = [];
  for (const symbol of symbols) {
    try {
      const result = await syncSymbol(symbol, args);
      written += result.snapshots;
      ok += 1;
      console.log(`[${symbol}] weekly=${result.weeklyRows} dailyBasic=${result.dailyBasicRows} adjFactor=${result.adjFactorRows} snapshots=${result.snapshots}`);
    } catch (error) {
      if (isTushareTokenError(error)) throw error;
      failed.push(symbol);
      console.error(`[${symbol}] failed: ${error instanceof Error ? error.message : error}`);
    }
    if (args.sleep > 0) await sleepMs(args.sleep);
  }

  console.log(`done ok=${ok} snapshots=${written} failed=${failed.length} failedSymbols=${failed.join(',')}`);
  return ok > 0 || failed.length === 0 ? 0 : 1;
};

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    if (isTushareTokenError(error)) {
      console.warn(`Skipping Tushare valuation snapshot sync: ${error.message}`);
      process.exit(0);
    }
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });