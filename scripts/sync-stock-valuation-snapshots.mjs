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

function addYearsToTushareDate(value, years) {
  const text = normalizeTushareDate(value);
  const date = dateFromTushare(text);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return formatTushareDate(date);
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

const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const conservativeAvailabilityDate = (reportDate) => {
  const month = reportDate.getUTCMonth() + 1;
  if (month === 12) return addDays(reportDate, 120);
  if (month === 6) return addDays(reportDate, 75);
  return addDays(reportDate, 45);
};

const valueOfStatementField = (field) => {
  if (Array.isArray(field)) return numberOrNull(field[0]);
  return numberOrNull(field);
};

const reportKey = (reportDate) => `${reportDate.getUTCFullYear()}-${String(reportDate.getUTCMonth() + 1).padStart(2, '0')}`;

const reportKeyFromTushareDate = (value) => {
  const text = normalizeTushareDate(value);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}`;
};

const reportMonthFromTushareDate = (value) => Number(normalizeTushareDate(value).slice(4, 6));

const calculateDeductedNetProfitTtm = (row, rowsByYearMonth) => {
  const reportDate = row.reportDate;
  const year = reportDate.getUTCFullYear();
  const month = reportDate.getUTCMonth() + 1;
  const current = valueOfStatementField(row.fields?.net_profit_after_nrgal_atsolc);
  if (current == null) return null;
  if (month === 12) return current;

  const previousAnnual = rowsByYearMonth.get(`${year - 1}-12`);
  const previousSamePeriod = rowsByYearMonth.get(`${year - 1}-${String(month).padStart(2, '0')}`);
  const previousAnnualValue = valueOfStatementField(previousAnnual?.fields?.net_profit_after_nrgal_atsolc);
  const previousSamePeriodValue = valueOfStatementField(previousSamePeriod?.fields?.net_profit_after_nrgal_atsolc);
  if (previousAnnualValue == null || previousSamePeriodValue == null) return null;

  return current + previousAnnualValue - previousSamePeriodValue;
};

const calculateTushareDeductedNetProfitTtm = (row, rowsByYearMonth) => {
  const endDate = normalizeTushareDate(row.end_date);
  const year = Number(endDate.slice(0, 4));
  const month = reportMonthFromTushareDate(endDate);
  const current = numberOrNull(row.profit_dedt);
  if (current == null) return null;
  if (month === 12) return current;

  const previousAnnual = rowsByYearMonth.get(`${year - 1}-12`);
  const previousSamePeriod = rowsByYearMonth.get(`${year - 1}-${String(month).padStart(2, '0')}`);
  const previousAnnualValue = numberOrNull(previousAnnual?.profit_dedt);
  const previousSamePeriodValue = numberOrNull(previousSamePeriod?.profit_dedt);
  if (previousAnnualValue == null || previousSamePeriodValue == null) return null;

  return current + previousAnnualValue - previousSamePeriodValue;
};

const buildTushareIndicatorFundamentalRows = (indicatorRows) => {
  const rowsByEndDate = new Map();
  for (const row of indicatorRows) {
    if (!row.end_date || !row.ann_date) continue;
    const existing = rowsByEndDate.get(row.end_date);
    if (!existing || String(row.ann_date) >= String(existing.ann_date)) rowsByEndDate.set(row.end_date, row);
  }
  const rows = [...rowsByEndDate.values()].sort((left, right) => String(left.end_date).localeCompare(String(right.end_date)));
  const rowsByYearMonth = new Map(rows.map((row) => [reportKeyFromTushareDate(row.end_date), row]));

  return rows
    .map((row) => ({
      availableDate: dateFromTushare(row.ann_date),
      deductedNetProfitTtm: calculateTushareDeductedNetProfitTtm(row, rowsByYearMonth),
    }))
    .filter((row) => row.deductedNetProfitTtm != null && row.deductedNetProfitTtm > 0);
};

const buildStatementFundamentalRows = async (symbol) => {
  const rows = await prisma.stockFinancialStatement.findMany({
    where: { symbol, statement: 'income' },
    select: { reportDate: true, fields: true },
    orderBy: { reportDate: 'asc' },
  });
  const rowsByYearMonth = new Map(rows.map((row) => [reportKey(row.reportDate), row]));
  return rows
    .map((row) => ({
      availableDate: conservativeAvailabilityDate(row.reportDate),
      deductedNetProfitTtm: calculateDeductedNetProfitTtm(row, rowsByYearMonth),
    }))
    .filter((row) => row.deductedNetProfitTtm != null && row.deductedNetProfitTtm > 0);
};

const buildCompactFundamentalRows = async (symbol) => {
  const rows = await prisma.stockFundamental.findMany({
    where: { symbol },
    select: { reportDate: true, deductedNetProfitTtm: true },
    orderBy: { reportDate: 'asc' },
  });
  return rows
    .map((row) => ({
      availableDate: conservativeAvailabilityDate(row.reportDate),
      deductedNetProfitTtm: numberOrNull(row.deductedNetProfitTtm),
    }))
    .filter((row) => row.deductedNetProfitTtm != null && row.deductedNetProfitTtm > 0);
};

const buildFundamentalMatcher = async (symbol, indicatorRows) => {
  const tushareRows = buildTushareIndicatorFundamentalRows(indicatorRows);
  const statementRows = tushareRows.length > 0 ? [] : await buildStatementFundamentalRows(symbol);
  const compactRows = tushareRows.length > 0 || statementRows.length > 0 ? [] : await buildCompactFundamentalRows(symbol);
  const availableRows = [...tushareRows, ...statementRows, ...compactRows]
    .sort((left, right) => left.availableDate.getTime() - right.availableDate.getTime());

  let cursor = -1;
  return (tradeDate) => {
    while (cursor + 1 < availableRows.length && availableRows[cursor + 1].availableDate.getTime() <= tradeDate.getTime()) {
      cursor += 1;
    }
    return cursor >= 0 ? availableRows[cursor] : null;
  };
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

const fetchFinaIndicatorRows = (tsCode, startDate, endDate) => fetchTushare(
  'fina_indicator',
  { ts_code: tsCode, start_date: addYearsToTushareDate(startDate, -2), end_date: endDate },
  ['ts_code', 'ann_date', 'end_date', 'profit_dedt'],
);

const buildSnapshots = async (symbol, weeklyRows, dailyBasicRows, indicatorRows) => {
  const basicByDate = new Map(dailyBasicRows.map((row) => [String(row.trade_date), row]));
  const findFundamental = await buildFundamentalMatcher(symbol, indicatorRows);

  return weeklyRows
    .slice()
    .sort((left, right) => String(left.trade_date).localeCompare(String(right.trade_date)))
    .map((weekly) => {
      const basic = basicByDate.get(String(weekly.trade_date));
      if (!basic) return null;

      const tradeDate = dateFromTushare(weekly.trade_date);
      const totalMarketCap = multiplyOrNull(basic.total_mv, 10000);
      const fundamental = findFundamental(tradeDate);
      const deductedNetProfitTtm = fundamental?.deductedNetProfitTtm ?? null;
      const deductedPe = totalMarketCap != null && deductedNetProfitTtm != null && deductedNetProfitTtm > 0
        ? totalMarketCap / deductedNetProfitTtm
        : null;

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
        pe: numberOrNull(basic.pe),
        peTtm: numberOrNull(basic.pe_ttm),
        pb: numberOrNull(basic.pb),
        dividendYield: numberOrNull(basic.dv_ratio),
        dividendYieldTtm: numberOrNull(basic.dv_ttm),
        deductedNetProfitTtm,
        deductedPe,
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
      pe: snapshot.pe,
      peTtm: snapshot.peTtm,
      pb: snapshot.pb,
      dividendYield: snapshot.dividendYield,
      dividendYieldTtm: snapshot.dividendYieldTtm,
      deductedNetProfitTtm: snapshot.deductedNetProfitTtm,
      deductedPe: snapshot.deductedPe,
      source: snapshot.source,
      fetchedAt: new Date(),
    },
  });
};

const syncSymbol = async (symbol, args) => {
  const tsCode = toTsCode(symbol);
  const [weeklyRows, dailyBasicRows, indicatorRows] = await Promise.all([
    fetchWeeklyRows(tsCode, args.startDate, args.endDate),
    fetchDailyBasicRows(tsCode, args.startDate, args.endDate),
    fetchFinaIndicatorRows(tsCode, args.startDate, args.endDate),
  ]);
  const snapshots = await buildSnapshots(symbol, weeklyRows, dailyBasicRows, indicatorRows);
  if (!args.dryRun) {
    for (const snapshot of snapshots) await upsertSnapshot(snapshot);
  }
  const withDeductedPe = snapshots.filter((snapshot) => snapshot.deductedPe != null).length;
  return { weeklyRows: weeklyRows.length, dailyBasicRows: dailyBasicRows.length, indicatorRows: indicatorRows.length, snapshots: snapshots.length, withDeductedPe };
};

const main = async () => {
  const args = parseArgs();
  let symbols = await fetchSymbols(args);
  if (args.limit > 0) symbols = symbols.slice(0, args.limit);

  console.log(`syncing valuation snapshots period=${PERIOD} start=${args.startDate} end=${args.endDate} symbols=${symbols.length}`);

  let ok = 0;
  let written = 0;
  let deductedPeCount = 0;
  const failed = [];
  for (const symbol of symbols) {
    try {
      const result = await syncSymbol(symbol, args);
      written += result.snapshots;
      deductedPeCount += result.withDeductedPe;
      ok += 1;
      console.log(`[${symbol}] weekly=${result.weeklyRows} dailyBasic=${result.dailyBasicRows} indicators=${result.indicatorRows} snapshots=${result.snapshots} deductedPe=${result.withDeductedPe}`);
    } catch (error) {
      if (isTushareTokenError(error)) throw error;
      failed.push(symbol);
      console.error(`[${symbol}] failed: ${error instanceof Error ? error.message : error}`);
    }
    if (args.sleep > 0) await sleepMs(args.sleep);
  }

  console.log(`done ok=${ok} snapshots=${written} deductedPe=${deductedPeCount} failed=${failed.length} failedSymbols=${failed.join(',')}`);
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