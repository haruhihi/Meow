#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { setAppDatabaseUrl } from './database-url.mjs';

const STOCK_UNIVERSE_PATH = new URL('../src/config/stock-universe.json', import.meta.url);
const CALCULATION_VERSION = 1;
const DOMAIN_FUNDAMENTAL_LATEST = 'fundamental_latest';
const DOMAIN_VALUATION_WEEKLY = 'valuation_weekly';

setAppDatabaseUrl();

const prisma = new PrismaClient();

const parseArgs = () => {
  const args = process.argv.slice(2);
  const symbols = [];
  let limit = 0;

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
    }
  }

  return { symbols: symbols.filter(Boolean), limit };
};

const loadStockUniverseSymbols = () => {
  const items = JSON.parse(readFileSync(STOCK_UNIVERSE_PATH, 'utf8'));
  return Array.isArray(items)
    ? items.map((item) => String(item?.symbol ?? '').trim().toUpperCase()).filter(Boolean)
    : [];
};

const fetchSymbols = async (explicitSymbols, limit) => {
  if (explicitSymbols.length > 0) return [...new Set(explicitSymbols)].sort();

  const holdings = await prisma.stockHolding.findMany({
    distinct: ['symbol'],
    select: { symbol: true },
    orderBy: { symbol: 'asc' },
  });
  const symbols = [...new Set([...holdings.map((row) => row.symbol), ...loadStockUniverseSymbols()])].sort();
  return limit > 0 ? symbols.slice(0, limit) : symbols;
};

const readStatementNumber = (fields, key) => {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  const value = fields[key];
  const raw = Array.isArray(value) ? value[0] : value;
  const numberValue = typeof raw === 'number' ? raw : Number(raw ?? Number.NaN);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const readStatementAnyNumber = (fields, keys) => {
  for (const key of keys) {
    const value = readStatementNumber(fields, key);
    if (value != null) return value;
  }
  return null;
};

const reportNameFromDate = (date) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (month === 3) return `${year}一季报`;
  if (month === 6) return `${year}中报`;
  if (month === 9) return `${year}三季报`;
  if (month === 12) return `${year}年报`;
  return `${year}/${String(month).padStart(2, '0')}`;
};

const reportKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const reportNameOf = (row) => row?.reportName ?? (row?.reportDate ? reportNameFromDate(row.reportDate) : null);

const missingWarning = (reportName, fieldLabel) => `缺少 ${reportName} ${fieldLabel}，缓存暂不可严格计算`;

const conservativeAvailabilityDate = (reportDate) => {
  const month = reportDate.getUTCMonth() + 1;
  const delayDays = month === 12 ? 120 : 45;
  const date = new Date(reportDate.getTime());
  date.setUTCDate(date.getUTCDate() + delayDays);
  return date;
};

const calculateStatementTtmResult = (rows, keys, fieldLabel) => {
  const sortedRows = rows.slice().sort((left, right) => right.reportDate.getTime() - left.reportDate.getTime());
  const latest = sortedRows[0];
  if (!latest) return { value: null, warning: null, report: null };

  const current = readStatementAnyNumber(latest.fields, keys);
  if (current == null) return { value: null, warning: missingWarning(reportNameOf(latest), fieldLabel), report: latest };

  const month = latest.reportDate.getUTCMonth() + 1;
  if (month === 12) return { value: current, warning: null, report: latest };

  const year = latest.reportDate.getUTCFullYear();
  const rowsByKey = new Map(sortedRows.map((row) => [reportKey(row.reportDate), row]));
  const previousAnnual = rowsByKey.get(`${year - 1}-12`);
  const previousSamePeriod = rowsByKey.get(`${year - 1}-${String(month).padStart(2, '0')}`);
  const previousAnnualValue = previousAnnual ? readStatementAnyNumber(previousAnnual.fields, keys) : null;
  const previousSamePeriodValue = previousSamePeriod ? readStatementAnyNumber(previousSamePeriod.fields, keys) : null;

  if (!previousAnnual || previousAnnualValue == null) {
    return { value: null, warning: missingWarning(reportNameFromDate(new Date(Date.UTC(year - 1, 11, 31))), fieldLabel), report: latest };
  }
  if (!previousSamePeriod || previousSamePeriodValue == null) {
    return { value: null, warning: missingWarning(reportNameFromDate(new Date(Date.UTC(year - 1, month - 1, 1))), fieldLabel), report: latest };
  }

  return { value: current + previousAnnualValue - previousSamePeriodValue, warning: null, report: latest };
};

const calculateFundamentalTtmResult = (rows, field, fieldLabel) => {
  const sortedRows = rows.slice().sort((left, right) => right.reportDate.getTime() - left.reportDate.getTime());
  const latest = sortedRows[0];
  if (!latest) return { value: null, warning: null, report: null };

  const current = latest[field] ?? null;
  if (current == null) return { value: null, warning: missingWarning(reportNameOf(latest), fieldLabel), report: latest };

  const month = latest.reportDate.getUTCMonth() + 1;
  if (month === 12) return { value: current, warning: null, report: latest };

  const year = latest.reportDate.getUTCFullYear();
  const rowsByKey = new Map(sortedRows.map((row) => [reportKey(row.reportDate), row]));
  const previousAnnual = rowsByKey.get(`${year - 1}-12`);
  const previousSamePeriod = rowsByKey.get(`${year - 1}-${String(month).padStart(2, '0')}`);
  const previousAnnualValue = previousAnnual?.[field] ?? null;
  const previousSamePeriodValue = previousSamePeriod?.[field] ?? null;

  if (!previousAnnual || previousAnnualValue == null) {
    return { value: null, warning: missingWarning(reportNameFromDate(new Date(Date.UTC(year - 1, 11, 31))), fieldLabel), report: latest };
  }
  if (!previousSamePeriod || previousSamePeriodValue == null) {
    return { value: null, warning: missingWarning(reportNameFromDate(new Date(Date.UTC(year - 1, month - 1, 1))), fieldLabel), report: latest };
  }

  return { value: current + previousAnnualValue - previousSamePeriodValue, warning: null, report: latest };
};

const collectWarnings = (...results) => [...new Set(results.map((result) => result.warning).filter(Boolean))];

const metricStatus = (warnings) => (warnings.length > 0 ? 'missing_input' : 'fresh');

const toInputJson = (value) => JSON.parse(JSON.stringify(value));

const upsertCache = async ({ symbol, domain, status, calculatedThroughReportDate, calculatedThroughReportName, calculatedThroughSnapshotDate, metrics, warnings }) => {
  const now = new Date();
  const data = {
    status,
    calculationVersion: CALCULATION_VERSION,
    calculatedThroughReportDate,
    calculatedThroughReportName,
    calculatedThroughSnapshotDate,
    metrics: toInputJson(metrics),
    warnings: warnings.length > 0 ? toInputJson(warnings) : null,
    calculatedAt: now,
  };

  await prisma.stockMetricCache.upsert({
    where: { symbol_domain: { symbol, domain } },
    create: { symbol, domain, ...data },
    update: data,
  });
};

const latestAnnualDeductedNetProfit = (fundamentals) => fundamentals
  .filter((row) => row.reportName?.includes('年报'))
  .sort((left, right) => right.reportDate.getTime() - left.reportDate.getTime())[0]?.deductedNetProfit ?? null;

const refreshFundamentalCache = async (symbol, statementsByType, fundamentals) => {
  const incomeRows = statementsByType.get('income') ?? [];
  const cashFlowRows = statementsByType.get('cash_flow') ?? [];
  const latestFundamental = fundamentals[0] ?? null;
  const deductedNetProfitTtm = calculateStatementTtmResult(incomeRows, ['net_profit_after_nrgal_atsolc', 'profit_dedt'], '扣非净利润');
  const netProfitTtm = calculateStatementTtmResult(incomeRows, ['n_income_attr_p', 'n_income'], '归母净利润');
  const revenueTtm = calculateStatementTtmResult(incomeRows, ['revenue', 'total_revenue'], '营业收入');
  const operatingCashFlowTtm = calculateStatementTtmResult(cashFlowRows, ['n_cashflow_act'], '经营现金流');
  const capitalExpenditureTtm = calculateStatementTtmResult(cashFlowRows, ['c_pay_acq_const_fiolta'], '资本开支');

  const resolvedDeductedNetProfitTtm = deductedNetProfitTtm.value != null
    ? deductedNetProfitTtm
    : calculateFundamentalTtmResult(fundamentals, 'deductedNetProfit', '扣非净利润');
  const resolvedNetProfitTtm = netProfitTtm.value != null ? netProfitTtm : calculateFundamentalTtmResult(fundamentals, 'netProfit', '归母净利润');
  const resolvedRevenueTtm = revenueTtm.value != null ? revenueTtm : calculateFundamentalTtmResult(fundamentals, 'revenue', '营业收入');
  const resolvedOperatingCashFlowTtm = operatingCashFlowTtm.value != null ? operatingCashFlowTtm : calculateFundamentalTtmResult(fundamentals, 'operatingCashFlow', '经营现金流');
  const resolvedCapitalExpenditureTtm = capitalExpenditureTtm.value != null ? capitalExpenditureTtm : calculateFundamentalTtmResult(fundamentals, 'capitalExpenditure', '资本开支');
  const report = resolvedDeductedNetProfitTtm.report ?? latestFundamental;
  const warnings = collectWarnings(
    resolvedDeductedNetProfitTtm,
    resolvedNetProfitTtm,
    resolvedRevenueTtm,
    resolvedOperatingCashFlowTtm,
    resolvedCapitalExpenditureTtm,
  );

  await upsertCache({
    symbol,
    domain: DOMAIN_FUNDAMENTAL_LATEST,
    status: metricStatus(warnings),
    calculatedThroughReportDate: report?.reportDate ?? null,
    calculatedThroughReportName: reportNameOf(report),
    calculatedThroughSnapshotDate: null,
    metrics: {
      totalShares: latestFundamental?.totalShares ?? null,
      deductedNetProfit: latestFundamental?.deductedNetProfit ?? null,
      latestAnnualDeductedNetProfit: latestAnnualDeductedNetProfit(fundamentals),
      deductedNetProfitTtm: resolvedDeductedNetProfitTtm.value,
      netProfit: latestFundamental?.netProfit ?? null,
      netProfitTtm: resolvedNetProfitTtm.value,
      revenue: latestFundamental?.revenue ?? null,
      revenueTtm: resolvedRevenueTtm.value,
      netAsset: latestFundamental?.netAsset ?? null,
      totalAssets: latestFundamental?.totalAssets ?? null,
      operatingCashFlow: latestFundamental?.operatingCashFlow ?? null,
      operatingCashFlowTtm: resolvedOperatingCashFlowTtm.value,
      capitalExpenditure: latestFundamental?.capitalExpenditure ?? null,
      capitalExpenditureTtm: resolvedCapitalExpenditureTtm.value,
      reportDate: latestFundamental?.reportDate?.toISOString() ?? null,
    },
    warnings,
  });

  return { status: metricStatus(warnings), warnings };
};

const buildAvailableDeductedTtmRows = (incomeRows) => {
  const sortedRows = incomeRows.slice().sort((left, right) => left.reportDate.getTime() - right.reportDate.getTime());
  return sortedRows
    .map((row) => {
      const result = calculateStatementTtmResult(
        sortedRows.filter((item) => item.reportDate.getTime() <= row.reportDate.getTime()),
        ['net_profit_after_nrgal_atsolc', 'profit_dedt'],
        '扣非净利润',
      );
      return {
        reportDate: row.reportDate,
        reportName: reportNameOf(row),
        availableDate: conservativeAvailabilityDate(row.reportDate),
        deductedNetProfitTtm: result.value,
        warning: result.warning,
      };
    })
    .filter((row) => row.deductedNetProfitTtm != null && row.deductedNetProfitTtm > 0)
    .sort((left, right) => left.availableDate.getTime() - right.availableDate.getTime());
};

const percentileRank = (sortedValues, value) => {
  if (sortedValues.length === 0 || value == null) return null;
  return sortedValues.filter((item) => item <= value).length / sortedValues.length;
};

const refreshValuationCache = async (symbol, statementsByType) => {
  const incomeRows = statementsByType.get('income') ?? [];
  const availableTtmRows = buildAvailableDeductedTtmRows(incomeRows);
  const latestTtmInput = calculateStatementTtmResult(incomeRows, ['net_profit_after_nrgal_atsolc', 'profit_dedt'], '扣非净利润');
  const snapshots = await prisma.stockValuationSnapshot.findMany({
    where: { symbol, period: 'WEEK' },
    orderBy: { tradeDate: 'asc' },
  });
  let cursor = -1;
  const history = [];

  for (const snapshot of snapshots) {
    while (cursor + 1 < availableTtmRows.length && availableTtmRows[cursor + 1].availableDate.getTime() <= snapshot.tradeDate.getTime()) {
      cursor += 1;
    }
    const activeTtm = cursor >= 0 ? availableTtmRows[cursor] : null;
    const pe = snapshot.totalMarketCap != null && activeTtm?.deductedNetProfitTtm != null && activeTtm.deductedNetProfitTtm > 0
      ? snapshot.totalMarketCap / activeTtm.deductedNetProfitTtm
      : null;
    history.push({
      date: snapshot.tradeDate.toISOString(),
      pe: pe != null ? Math.round(pe * 100) / 100 : null,
      pb: snapshot.pb != null ? Math.round(snapshot.pb * 100) / 100 : null,
      sourceReportDate: activeTtm?.reportDate.toISOString() ?? null,
      sourceReportName: activeTtm?.reportName ?? null,
    });
  }

  const peValues = history
    .map((row) => row.pe)
    .filter((value) => value != null && Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  const pbValues = history
    .map((row) => row.pb)
    .filter((value) => value != null && Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  const valuationHistory = history.map((row) => ({
    ...row,
    pePercentile: row.pe != null ? percentileRank(peValues, row.pe) : null,
    pbPercentile: row.pb != null ? percentileRank(pbValues, row.pb) : null,
  }));
  const lastSnapshot = snapshots.at(-1) ?? null;
  const lastHistoryWithReport = [...history].reverse().find((row) => row.sourceReportDate);
  const warnings = latestTtmInput.warning ? [latestTtmInput.warning] : [];

  await upsertCache({
    symbol,
    domain: DOMAIN_VALUATION_WEEKLY,
    status: peValues.length > 0 ? metricStatus(warnings) : 'missing_input',
    calculatedThroughReportDate: lastHistoryWithReport?.sourceReportDate ? new Date(lastHistoryWithReport.sourceReportDate) : null,
    calculatedThroughReportName: lastHistoryWithReport?.sourceReportName ?? null,
    calculatedThroughSnapshotDate: lastSnapshot?.tradeDate ?? null,
    metrics: {
      peValues,
      pbValues,
      sampleCount: peValues.length,
      startDate: snapshots[0]?.tradeDate?.toISOString() ?? null,
      endDate: lastSnapshot?.tradeDate?.toISOString() ?? null,
      valuationHistory,
    },
    warnings,
  });

  return { status: peValues.length > 0 ? metricStatus(warnings) : 'missing_input', warnings, sampleCount: peValues.length };
};

const refreshSymbol = async (symbol) => {
  const [statements, fundamentals] = await Promise.all([
    prisma.stockFinancialStatement.findMany({
      where: { symbol, statement: { in: ['income', 'cash_flow'] } },
      select: { statement: true, reportDate: true, reportName: true, fields: true },
      orderBy: [{ statement: 'asc' }, { reportDate: 'desc' }],
    }),
    prisma.stockFundamental.findMany({
      where: { symbol },
      orderBy: { reportDate: 'desc' },
    }),
  ]);
  const statementsByType = new Map();
  for (const statement of statements) {
    const current = statementsByType.get(statement.statement) ?? [];
    current.push(statement);
    statementsByType.set(statement.statement, current);
  }

  const fundamental = await refreshFundamentalCache(symbol, statementsByType, fundamentals);
  const valuation = await refreshValuationCache(symbol, statementsByType);
  console.log(`[${symbol}] fundamental=${fundamental.status} valuation=${valuation.status} peSamples=${valuation.sampleCount} warnings=${[...fundamental.warnings, ...valuation.warnings].join(';')}`);
};

const main = async () => {
  const args = parseArgs();
  const symbols = await fetchSymbols(args.symbols, args.limit);
  for (const symbol of symbols) {
    await refreshSymbol(symbol);
  }
  console.log(`done symbols=${symbols.length}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });