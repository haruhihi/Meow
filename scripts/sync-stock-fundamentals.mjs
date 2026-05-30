#!/usr/bin/env node

import { setAppDatabaseUrl } from './database-url.mjs';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

const SOURCE = 'xueqiu';
const APP_PAGE = 'https://xueqiu.com/snowman/S/{symbol}/detail#/ZYCWZB';
const FUNDAMENTAL_COUNT = 8;
const DEFAULT_STATEMENT_COUNT = 40;
const STOCK_UNIVERSE_PATH = new URL('../src/config/stock-universe.json', import.meta.url);

setAppDatabaseUrl();

const prisma = new PrismaClient();

const toXueqiuSymbol = (symbol) => (symbol.startsWith('6') ? `SH${symbol}` : `SZ${symbol}`);

const parseArgs = () => {
  const args = process.argv.slice(2);
  const symbols = [];
  let limit = 0;
  let dryRun = false;
  let sleep = 1500;
  let statementCount = DEFAULT_STATEMENT_COUNT;

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
    } else if (arg === '--statement-count') {
      statementCount = Number(args[index + 1] ?? statementCount);
      index += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return { symbols: symbols.filter(Boolean), limit, dryRun, sleep, statementCount: Math.min(Math.max(statementCount, FUNDAMENTAL_COUNT), 80) };
};

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadStockUniverseSymbols = () => {
  const text = readFileSync(STOCK_UNIVERSE_PATH, 'utf8');
  const items = JSON.parse(text);
  return Array.isArray(items)
    ? items.map((item) => String(item?.symbol ?? '').trim().toUpperCase()).filter(Boolean)
    : [];
};

const fetchSymbols = async (explicitSymbols) => {
  if (explicitSymbols.length > 0) {
    return [...new Set(explicitSymbols)].sort();
  }
  const rows = await prisma.stockHolding.findMany({
    distinct: ['symbol'],
    select: { symbol: true },
    orderBy: { symbol: 'asc' },
  });
  return [...new Set([...rows.map((row) => row.symbol), ...loadStockUniverseSymbols()])].sort();
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
  const cookieHeader = [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
  return { cookieHeader };
};

const fetchXueqiuJson = async (url, xueqiuSymbol, cookieHeader) => {
  const response = await fetch(url, {
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
  return payload;
};

const financeUrl = (statement, xueqiuSymbol, type = 'Q4', count = FUNDAMENTAL_COUNT) => {
  const url = new URL(`https://stock.xueqiu.com/v5/stock/finance/cn/${statement}.json`);
  url.searchParams.set('symbol', xueqiuSymbol);
  url.searchParams.set('type', type);
  url.searchParams.set('is_detail', 'true');
  url.searchParams.set('count', String(count));
  url.searchParams.set('timestamp', '');
  return url.toString();
};

const realtimeQuoteUrl = (xueqiuSymbol) => {
  const url = new URL('https://stock.xueqiu.com/v5/stock/realtime/quotec.json');
  url.searchParams.set('symbol', xueqiuSymbol);
  return url.toString();
};

const valueOf = (field) => {
  if (Array.isArray(field)) return typeof field[0] === 'number' ? field[0] : null;
  return typeof field === 'number' ? field : null;
};

const readQuoteTotalShares = (payload) => {
  const quote = Array.isArray(payload?.data) ? payload.data[0] : null;
  const marketCapital = valueOf(quote?.market_capital);
  const currentPrice = valueOf(quote?.current);
  return marketCapital && marketCapital > 0 && currentPrice && currentPrice > 0
    ? marketCapital / currentPrice
    : undefined;
};

const normalizeJsonValue = (value) => JSON.parse(JSON.stringify(value));

const dateFromMillis = (value) => {
  if (!value) return null;
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const mapByReportDate = (items) => {
  const map = new Map();
  for (const item of items ?? []) {
    const reportDate = dateFromMillis(item.report_date);
    if (!reportDate) continue;
    map.set(reportDate.toISOString().slice(0, 10), { item, reportDate });
  }
  return map;
};

const valueOfAny = (item, fieldNames) => {
  for (const fieldName of fieldNames) {
    const value = valueOf(item?.[fieldName]);
    if (value != null) return value;
  }
  return null;
};

const findReportByYearMonth = (items, year, month) =>
  (items ?? []).find((item) => {
    const date = dateFromMillis(item.report_date);
    return date?.getFullYear() === year && date.getMonth() + 1 === month;
  });

const trailingTwelveMonths = (items, fieldNames) => {
  const sortedItems = (items ?? [])
    .slice()
    .sort((left, right) => Number(right.report_date ?? 0) - Number(left.report_date ?? 0));
  const latest = sortedItems[0];
  const latestDate = dateFromMillis(latest?.report_date);
  const latestValue = valueOfAny(latest, fieldNames);
  if (!latest || !latestDate || latestValue == null) return null;

  const latestYear = latestDate.getFullYear();
  const latestMonth = latestDate.getMonth() + 1;
  if (latestMonth === 12) return latestValue;

  const previousAnnual = findReportByYearMonth(sortedItems, latestYear - 1, 12);
  const previousSamePeriod = findReportByYearMonth(sortedItems, latestYear - 1, latestMonth);
  const previousAnnualValue = valueOfAny(previousAnnual, fieldNames);
  const previousSamePeriodValue = valueOfAny(previousSamePeriod, fieldNames);
  if (previousAnnualValue == null || previousSamePeriodValue == null) return null;

  return latestValue + previousAnnualValue - previousSamePeriodValue;
};

const fetchFundamentals = async (symbol, options) => {
  const xueqiuSymbol = toXueqiuSymbol(symbol);
  const { cookieHeader } = await createXueqiuSession(xueqiuSymbol);
  if (!cookieHeader) throw new Error('missing xueqiu anonymous cookie');
  const statementCount = options.statementCount;

  const realtimeQuotePayload = await fetchXueqiuJson(realtimeQuoteUrl(xueqiuSymbol), xueqiuSymbol, cookieHeader);
  const totalShares = readQuoteTotalShares(realtimeQuotePayload);
  await sleepMs(300);
  const incomePayload = await fetchXueqiuJson(financeUrl('income', xueqiuSymbol, 'Q4'), xueqiuSymbol, cookieHeader);
  await sleepMs(300);
  const balancePayload = await fetchXueqiuJson(financeUrl('balance', xueqiuSymbol, 'Q4'), xueqiuSymbol, cookieHeader);
  await sleepMs(300);
  const cashFlowPayload = await fetchXueqiuJson(financeUrl('cash_flow', xueqiuSymbol, 'Q4'), xueqiuSymbol, cookieHeader);
  await sleepMs(300);
  const incomeAllPayload = await fetchXueqiuJson(financeUrl('income', xueqiuSymbol, 'all', statementCount), xueqiuSymbol, cookieHeader);
  await sleepMs(300);
  const balanceAllPayload = await fetchXueqiuJson(financeUrl('balance', xueqiuSymbol, 'all', statementCount), xueqiuSymbol, cookieHeader);
  await sleepMs(300);
  const cashFlowAllPayload = await fetchXueqiuJson(financeUrl('cash_flow', xueqiuSymbol, 'all', statementCount), xueqiuSymbol, cookieHeader);

  const incomeByDate = mapByReportDate(incomePayload.data?.list ?? []);
  const balanceByDate = mapByReportDate(balancePayload.data?.list ?? []);
  const cashFlowByDate = mapByReportDate(cashFlowPayload.data?.list ?? []);
  const dates = [...incomeByDate.keys()].filter((date) => balanceByDate.has(date));
  const incomeAll = incomeAllPayload.data?.list ?? [];
  const cashFlowAll = cashFlowAllPayload.data?.list ?? [];
  const ttm = {
    deductedNetProfitTtm: trailingTwelveMonths(incomeAll, ['net_profit_after_nrgal_atsolc']),
    netProfitTtm: trailingTwelveMonths(incomeAll, ['net_profit_atsopc', 'net_profit']),
    revenueTtm: trailingTwelveMonths(incomeAll, ['revenue', 'total_revenue']),
    operatingCashFlowTtm: trailingTwelveMonths(cashFlowAll, ['ncf_from_oa']),
    capitalExpenditureTtm: trailingTwelveMonths(cashFlowAll, ['cash_paid_for_assets']),
  };

  const fundamentals = dates.map((date) => {
    const income = incomeByDate.get(date).item;
    const balance = balanceByDate.get(date).item;
    const cashFlow = cashFlowByDate.get(date)?.item;
    return {
      symbol,
      reportDate: incomeByDate.get(date).reportDate,
      reportName: income.report_name ?? balance.report_name ?? null,
      totalShares,
      deductedNetProfit: valueOf(income.net_profit_after_nrgal_atsolc),
      deductedNetProfitTtm: ttm.deductedNetProfitTtm,
      netProfit: valueOf(income.net_profit_atsopc) ?? valueOf(income.net_profit),
      netProfitTtm: ttm.netProfitTtm,
      revenue: valueOf(income.revenue) ?? valueOf(income.total_revenue),
      revenueTtm: ttm.revenueTtm,
      netAsset: valueOf(balance.total_quity_atsopc) ?? valueOf(balance.total_holders_equity),
      totalAssets: valueOf(balance.total_assets),
      operatingCashFlow: valueOf(cashFlow?.ncf_from_oa),
      operatingCashFlowTtm: ttm.operatingCashFlowTtm,
      capitalExpenditure: valueOf(cashFlow?.cash_paid_for_assets),
      capitalExpenditureTtm: ttm.capitalExpenditureTtm,
    };
  });

  return {
    fundamentals,
    statements: [
      ...buildStatementItems(symbol, 'income', incomePayload.data?.list ?? []),
      ...buildStatementItems(symbol, 'balance', balancePayload.data?.list ?? []),
      ...buildStatementItems(symbol, 'cash_flow', cashFlowPayload.data?.list ?? []),
      ...buildStatementItems(symbol, 'income', incomeAllPayload.data?.list ?? []),
      ...buildStatementItems(symbol, 'balance', balanceAllPayload.data?.list ?? []),
      ...buildStatementItems(symbol, 'cash_flow', cashFlowAllPayload.data?.list ?? []),
    ],
  };
};

const buildStatementItems = (symbol, statement, items) =>
  (items ?? [])
    .map((item) => {
      const reportDate = dateFromMillis(item.report_date);
      if (!reportDate) return null;
      return {
        symbol,
        statement,
        reportDate,
        reportName: item.report_name ?? null,
        fields: normalizeJsonValue(item),
      };
    })
    .filter(Boolean);

const upsertFundamental = async (item) => {
  await prisma.stockFundamental.upsert({
    where: { symbol_reportDate: { symbol: item.symbol, reportDate: item.reportDate } },
    create: {
      symbol: item.symbol,
      reportDate: item.reportDate,
      reportName: item.reportName,
      totalShares: item.totalShares,
      deductedNetProfit: item.deductedNetProfit,
      deductedNetProfitTtm: item.deductedNetProfitTtm,
      netProfit: item.netProfit,
      netProfitTtm: item.netProfitTtm,
      revenue: item.revenue,
      revenueTtm: item.revenueTtm,
      netAsset: item.netAsset,
      totalAssets: item.totalAssets,
      operatingCashFlow: item.operatingCashFlow,
      operatingCashFlowTtm: item.operatingCashFlowTtm,
      capitalExpenditure: item.capitalExpenditure,
      capitalExpenditureTtm: item.capitalExpenditureTtm,
      source: SOURCE,
    },
    update: {
      reportName: item.reportName,
      totalShares: item.totalShares,
      deductedNetProfit: item.deductedNetProfit,
      deductedNetProfitTtm: item.deductedNetProfitTtm,
      netProfit: item.netProfit,
      netProfitTtm: item.netProfitTtm,
      revenue: item.revenue,
      revenueTtm: item.revenueTtm,
      netAsset: item.netAsset,
      totalAssets: item.totalAssets,
      operatingCashFlow: item.operatingCashFlow,
      operatingCashFlowTtm: item.operatingCashFlowTtm,
      capitalExpenditure: item.capitalExpenditure,
      capitalExpenditureTtm: item.capitalExpenditureTtm,
      source: SOURCE,
      fetchedAt: new Date(),
    },
  });
};

const upsertFinancialStatement = async (item) => {
  await prisma.stockFinancialStatement.upsert({
    where: {
      symbol_statement_reportDate: {
        symbol: item.symbol,
        statement: item.statement,
        reportDate: item.reportDate,
      },
    },
    create: {
      symbol: item.symbol,
      statement: item.statement,
      reportDate: item.reportDate,
      reportName: item.reportName,
      fields: item.fields,
      source: SOURCE,
    },
    update: {
      reportName: item.reportName,
      fields: item.fields,
      source: SOURCE,
      fetchedAt: new Date(),
    },
  });
};

const main = async () => {
  const args = parseArgs();
  let symbols = await fetchSymbols(args.symbols);
  if (args.limit > 0) symbols = symbols.slice(0, args.limit);
  console.log(`syncing ${symbols.length} symbols: ${symbols.join(', ')}`);

  let ok = 0;
  let statementsWritten = 0;
  const failed = [];
  for (const symbol of symbols) {
    try {
      const { fundamentals, statements } = await fetchFundamentals(symbol, { statementCount: args.statementCount });
      if (fundamentals.length === 0) {
        failed.push(symbol);
        console.error(`[${symbol}] no fundamentals returned`);
        continue;
      }
      for (const item of fundamentals) {
        console.log(`[${symbol}] report=${item.reportDate.toISOString().slice(0, 10)} totalShares=${item.totalShares} deductedNetProfit=${item.deductedNetProfit} deductedNetProfitTtm=${item.deductedNetProfitTtm} netAsset=${item.netAsset} operatingCashFlow=${item.operatingCashFlow} operatingCashFlowTtm=${item.operatingCashFlowTtm}`);
        if (!args.dryRun) await upsertFundamental(item);
      }
      for (const statement of statements) {
        if (!args.dryRun) await upsertFinancialStatement(statement);
        statementsWritten += 1;
      }
      console.log(`[${symbol}] financialStatements=${statements.length}`);
      ok += 1;
    } catch (error) {
      failed.push(symbol);
      console.error(`[${symbol}] failed: ${error instanceof Error ? error.message : error}`);
    }
    if (args.sleep > 0) await sleepMs(args.sleep);
  }

  console.log(`done ok=${ok} financialStatements=${statementsWritten} failed=${failed.length} failedSymbols=${failed.join(',')}`);
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
