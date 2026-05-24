#!/usr/bin/env node

import { setAppDatabaseUrl } from './database-url.mjs';
import { PrismaClient } from '@prisma/client';

const SOURCE = 'xueqiu';
const APP_PAGE = 'https://xueqiu.com/snowman/S/{symbol}/detail#/ZYCWZB';
const FUNDAMENTAL_COUNT = 8;

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
  if (explicitSymbols.length > 0) {
    return [...new Set(explicitSymbols)].sort();
  }
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

const financeUrl = (statement, xueqiuSymbol, type = 'Q4') => {
  const url = new URL(`https://stock.xueqiu.com/v5/stock/finance/cn/${statement}.json`);
  url.searchParams.set('symbol', xueqiuSymbol);
  url.searchParams.set('type', type);
  url.searchParams.set('is_detail', 'true');
  url.searchParams.set('count', String(FUNDAMENTAL_COUNT));
  url.searchParams.set('timestamp', '');
  return url.toString();
};

const valueOf = (field) => {
  if (Array.isArray(field)) return typeof field[0] === 'number' ? field[0] : null;
  return typeof field === 'number' ? field : null;
};

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

const sumLastFour = (items, fieldName) => {
  const values = (items ?? [])
    .slice()
    .sort((left, right) => Number(right.report_date ?? 0) - Number(left.report_date ?? 0))
    .slice(0, 4)
    .map((item) => valueOf(item?.[fieldName]));
  if (values.length < 4 || values.some((value) => value == null)) return null;
  return values.reduce((sum, value) => sum + value, 0);
};

const fetchFundamentals = async (symbol) => {
  const xueqiuSymbol = toXueqiuSymbol(symbol);
  const { cookieHeader } = await createXueqiuSession(xueqiuSymbol);
  if (!cookieHeader) throw new Error('missing xueqiu anonymous cookie');

  const [incomePayload, balancePayload, cashFlowPayload, incomeAllPayload, cashFlowAllPayload] = await Promise.all([
    fetchXueqiuJson(financeUrl('income', xueqiuSymbol, 'Q4'), xueqiuSymbol, cookieHeader),
    fetchXueqiuJson(financeUrl('balance', xueqiuSymbol, 'Q4'), xueqiuSymbol, cookieHeader),
    fetchXueqiuJson(financeUrl('cash_flow', xueqiuSymbol, 'Q4'), xueqiuSymbol, cookieHeader),
    fetchXueqiuJson(financeUrl('income', xueqiuSymbol, 'all'), xueqiuSymbol, cookieHeader),
    fetchXueqiuJson(financeUrl('cash_flow', xueqiuSymbol, 'all'), xueqiuSymbol, cookieHeader),
  ]);

  const incomeByDate = mapByReportDate(incomePayload.data?.list ?? []);
  const balanceByDate = mapByReportDate(balancePayload.data?.list ?? []);
  const cashFlowByDate = mapByReportDate(cashFlowPayload.data?.list ?? []);
  const dates = [...incomeByDate.keys()].filter((date) => balanceByDate.has(date));
  const incomeAll = incomeAllPayload.data?.list ?? [];
  const cashFlowAll = cashFlowAllPayload.data?.list ?? [];
  const ttm = {
    deductedNetProfitTtm: sumLastFour(incomeAll, 'net_profit_after_nrgal_atsolc'),
    netProfitTtm: sumLastFour(incomeAll, 'net_profit_atsopc') ?? sumLastFour(incomeAll, 'net_profit'),
    revenueTtm: sumLastFour(incomeAll, 'revenue') ?? sumLastFour(incomeAll, 'total_revenue'),
    operatingCashFlowTtm: sumLastFour(cashFlowAll, 'ncf_from_oa'),
    capitalExpenditureTtm: sumLastFour(cashFlowAll, 'cash_paid_for_assets'),
  };

  return dates.map((date) => {
    const income = incomeByDate.get(date).item;
    const balance = balanceByDate.get(date).item;
    const cashFlow = cashFlowByDate.get(date)?.item;
    return {
      symbol,
      reportDate: incomeByDate.get(date).reportDate,
      reportName: income.report_name ?? balance.report_name ?? null,
      totalShares: valueOf(balance.shares),
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
};

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

const main = async () => {
  const args = parseArgs();
  let symbols = await fetchSymbols(args.symbols);
  if (args.limit > 0) symbols = symbols.slice(0, args.limit);
  console.log(`syncing ${symbols.length} symbols: ${symbols.join(', ')}`);

  let ok = 0;
  const failed = [];
  for (const symbol of symbols) {
    try {
      const items = await fetchFundamentals(symbol);
      if (items.length === 0) {
        failed.push(symbol);
        console.error(`[${symbol}] no fundamentals returned`);
        continue;
      }
      for (const item of items) {
        console.log(`[${symbol}] report=${item.reportDate.toISOString().slice(0, 10)} totalShares=${item.totalShares} deductedNetProfit=${item.deductedNetProfit} deductedNetProfitTtm=${item.deductedNetProfitTtm} netAsset=${item.netAsset} operatingCashFlow=${item.operatingCashFlow} operatingCashFlowTtm=${item.operatingCashFlowTtm}`);
        if (!args.dryRun) await upsertFundamental(item);
      }
      ok += 1;
    } catch (error) {
      failed.push(symbol);
      console.error(`[${symbol}] failed: ${error instanceof Error ? error.message : error}`);
    }
    if (args.sleep > 0) await sleepMs(args.sleep);
  }

  console.log(`done ok=${ok} failed=${failed.length} failedSymbols=${failed.join(',')}`);
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
