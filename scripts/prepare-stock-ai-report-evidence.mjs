#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { setAppDatabaseUrl } from './database-url.mjs';

setAppDatabaseUrl();

const prisma = new PrismaClient();
const STOCK_UNIVERSE_PATH = new URL('../src/config/stock-universe.json', import.meta.url);
const DEFAULT_OUT_DIR = '.tmp/stock-ai-report-evidence';
const DEFAULT_ANNUAL_REPORT_COUNT = 5;
const FUNDAMENTAL_DOMAIN = 'fundamental_latest';
const VALUATION_DOMAIN = 'valuation_weekly';
const CNINFO_QUERY_URL = 'https://www.cninfo.com.cn/new/hisAnnouncement/query';
const CNINFO_STATIC_URL = 'https://static.cninfo.com.cn/';
const REPORT_KEYWORDS = ['存货', '原材料', '应收', '合同负债', '经营活动现金流', '现金流量', '减值', '投资收益', '审计', '管理层讨论'];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = {
    symbol: null,
    userId: 1,
    out: null,
    annualCount: DEFAULT_ANNUAL_REPORT_COUNT,
    noDownloadReports: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--symbol') {
      result.symbol = args[index + 1]?.trim().toUpperCase() ?? null;
      index += 1;
    } else if (arg === '--user-id') {
      result.userId = Number(args[index + 1] ?? 1);
      index += 1;
    } else if (arg === '--out') {
      result.out = args[index + 1] ?? null;
      index += 1;
    } else if (arg === '--annual-count') {
      result.annualCount = Number(args[index + 1] ?? DEFAULT_ANNUAL_REPORT_COUNT);
      index += 1;
    } else if (arg === '--no-download-reports') {
      result.noDownloadReports = true;
    }
  }

  if (!result.symbol) throw new Error('Pass --symbol <symbol>, for example --symbol 603288');
  if (!Number.isFinite(result.userId)) result.userId = 1;
  if (!Number.isFinite(result.annualCount) || result.annualCount < 1) result.annualCount = DEFAULT_ANNUAL_REPORT_COUNT;
  return result;
};

const loadUniverse = () => JSON.parse(readFileSync(STOCK_UNIVERSE_PATH, 'utf8'));
const readRecord = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const readNumber = (record, key) => {
  const value = readRecord(record)[key];
  const numberValue = typeof value === 'number' ? value : Number(value ?? Number.NaN);
  return Number.isFinite(numberValue) ? numberValue : null;
};
const yi = (value) => value == null ? '—' : `${(value / 1e8).toFixed(Math.abs(value) >= 1e10 ? 1 : 2)}亿`;
const number = (value, digits = 2) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
const percent = (value, digits = 1) => value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
const dateText = (value) => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10);
};
const sanitizeFilePart = (value) => String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
const ensureDir = (path) => mkdirSync(path, { recursive: true });

const quantile = (values, probability) => {
  const sorted = values.filter((item) => typeof item === 'number' && Number.isFinite(item) && item > 0).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const rank = (sorted.length - 1) * probability;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
};

const percentileRank = (values, value) => {
  const sorted = values.filter((item) => typeof item === 'number' && Number.isFinite(item) && item > 0).sort((left, right) => left - right);
  if (!sorted.length || value == null || !Number.isFinite(value)) return null;
  return sorted.filter((item) => item <= value).length / sorted.length;
};

const mdTable = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${row.map((cell) => String(cell ?? '—').replace(/\n/g, '<br>')).join(' | ')} |`),
].join('\n');

const dividendEventDedupeKey = (event) => [
  event.symbol,
  event.reportPeriod ?? '',
  event.cashPerTen ?? 0,
  event.bonusSharesPerTen ?? 0,
  event.transferSharesPerTen ?? 0,
].join('|');

const sumMarkedDividendEvents = (events) => {
  const uniqueEvents = [...new Map(events.map((event) => [dividendEventDedupeKey(event), event])).values()];
  const total = uniqueEvents.reduce((sum, event) => {
    const cashPerTen = event.cashPerTen;
    const baseShares = event.dividendBaseShares;
    if (!cashPerTen || cashPerTen <= 0 || !baseShares || baseShares <= 0) return sum;
    return sum + (cashPerTen / 10) * baseShares;
  }, 0);
  return total > 0 ? total : null;
};

const readMarkedDividendSource = (events) => events.length
  ? events.map((event) => `${event.reportPeriod ?? '未知'} 10派${number(event.cashPerTen)}元，基数${number(event.dividendBaseShares, 0)}股`).join('；')
  : null;

const fetchCninfoAnnualReports = async (symbol, count) => {
  const body = new URLSearchParams({
    stock: '',
    searchkey: symbol,
    plate: '',
    category: 'category_ndbg_szsh',
    trade: '',
    column: 'szse',
    columnTitle: '历史公告查询',
    pageNum: '1',
    pageSize: '30',
    tabName: 'fulltext',
    sortName: '',
    sortType: '',
    limit: '',
    seDate: '',
    showTitle: '',
  });

  const response = await fetch(CNINFO_QUERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: 'https://www.cninfo.com.cn/new/commonUrl/pageOfSearch?url=disclosure/list/search',
      'User-Agent': 'Mozilla/5.0 stock-report-evidence',
    },
    body,
  });
  if (!response.ok) throw new Error(`cninfo query failed: HTTP ${response.status}`);
  const payload = await response.json();
  const announcements = Array.isArray(payload.announcements) ? payload.announcements : [];
  return announcements
    .filter((item) => /年度报告/.test(item.announcementTitle ?? '') && !/摘要|英文|取消|更正后/.test(item.announcementTitle ?? ''))
    .slice(0, count)
    .map((item) => ({
      title: String(item.announcementTitle ?? '').replace(/<[^>]+>/g, ''),
      date: item.announcementTime ? new Date(item.announcementTime).toISOString().slice(0, 10) : null,
      url: `${CNINFO_STATIC_URL}${item.adjunctUrl}`,
      adjunctUrl: item.adjunctUrl,
    }));
};

const downloadFile = async (url, path) => {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 stock-report-evidence' } });
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(path, buffer);
};

const extractPdfText = (pdfPath, txtPath) => {
  try {
    const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 });
    writeFileSync(txtPath, text);
    return text;
  } catch (error) {
    return `PDF text extraction failed: ${error.message}`;
  }
};

const excerptAround = (text, keyword, length = 520) => {
  const index = text.indexOf(keyword);
  if (index < 0) return null;
  const start = Math.max(0, index - Math.floor(length / 2));
  return text.slice(start, start + length).replace(/\s+/g, ' ').trim();
};

const prepareOfficialReports = async ({ symbol, outDir, annualCount, noDownloadReports }) => {
  if (noDownloadReports) return { reports: [], warnings: ['--no-download-reports enabled'] };
  const warnings = [];
  let reports = [];
  try {
    reports = await fetchCninfoAnnualReports(symbol, annualCount);
  } catch (error) {
    warnings.push(error.message);
    return { reports: [], warnings };
  }

  const reportDir = join(outDir, 'official-reports');
  ensureDir(reportDir);
  for (const report of reports) {
    const baseName = sanitizeFilePart(`${symbol}-${report.title}`);
    const pdfPath = join(reportDir, `${baseName}.pdf`);
    const txtPath = join(reportDir, `${baseName}.txt`);
    report.pdfPath = pdfPath;
    report.textPath = txtPath;
    try {
      if (!existsSync(pdfPath)) await downloadFile(report.url, pdfPath);
      const text = existsSync(txtPath) ? readFileSync(txtPath, 'utf8') : extractPdfText(pdfPath, txtPath);
      report.excerpts = REPORT_KEYWORDS.flatMap((keyword) => {
        const excerpt = excerptAround(text, keyword);
        return excerpt ? [{ keyword, excerpt }] : [];
      }).slice(0, 10);
    } catch (error) {
      warnings.push(`${report.title}: ${error.message}`);
    }
  }
  return { reports, warnings };
};

const rowForStatement = (statement, date) => prisma.stockFinancialStatement.findUnique({
  where: { symbol_statement_reportDate: { symbol: statement.symbol, statement: statement.statement, reportDate: date } },
});

const buildEvidence = async (args) => {
  const universe = loadUniverse();
  const universeItem = universe.find((item) => String(item.symbol).toUpperCase() === args.symbol);
  if (!universeItem) throw new Error(`symbol ${args.symbol} is not in src/config/stock-universe.json`);

  const outDir = args.out ? dirname(args.out) : join(DEFAULT_OUT_DIR, args.symbol);
  ensureDir(outDir);
  const outPath = args.out ?? join(outDir, `${args.symbol}-evidence.md`);

  const [quote, fundamentals, annualFundamentals, metricCaches, valuationSnapshots, override, markedDividends] = await Promise.all([
    prisma.stockQuote.findFirst({ where: { symbol: args.symbol, userId: args.userId }, orderBy: { updatedAt: 'desc' } }),
    prisma.stockFundamental.findMany({ where: { symbol: args.symbol }, orderBy: { reportDate: 'desc' }, take: 12 }),
    prisma.stockFundamental.findMany({ where: { symbol: args.symbol, reportName: { contains: '年报' } }, orderBy: { reportDate: 'desc' }, take: 10 }),
    prisma.stockMetricCache.findMany({ where: { symbol: args.symbol, domain: { in: [FUNDAMENTAL_DOMAIN, VALUATION_DOMAIN] } } }),
    prisma.stockValuationSnapshot.findMany({ where: { symbol: args.symbol, period: 'WEEK' }, orderBy: { tradeDate: 'asc' } }),
    prisma.stockMetricOverride.findUnique({ where: { userId_symbol: { userId: args.userId, symbol: args.symbol } } }),
    prisma.stockDividendMarking.findMany({ where: { userId: args.userId, countTowardNormalizedDividend: true, event: { symbol: args.symbol } }, include: { event: true }, orderBy: { createdAt: 'desc' } }),
  ]);

  const cacheByDomain = new Map(metricCaches.map((cache) => [cache.domain, cache]));
  const fundamentalCache = cacheByDomain.get(FUNDAMENTAL_DOMAIN);
  const valuationCache = cacheByDomain.get(VALUATION_DOMAIN);
  const fundamentalMetrics = readRecord(fundamentalCache?.metrics);
  const valuationMetrics = readRecord(valuationCache?.metrics);
  const latestFundamental = fundamentals[0] ?? null;
  const latestSnapshot = valuationSnapshots.at(-1) ?? null;
  const totalShares = readNumber(fundamentalMetrics, 'totalShares') ?? latestFundamental?.totalShares ?? null;
  const deductedNetProfitTtm = readNumber(fundamentalMetrics, 'deductedNetProfitTtm');
  const price = quote?.currentPrice ?? latestSnapshot?.close ?? null;
  const marketCap = price != null && totalShares != null ? price * totalShares : latestSnapshot?.totalMarketCap ?? null;
  const currentDeductedPe = marketCap != null && deductedNetProfitTtm != null && deductedNetProfitTtm > 0 ? marketCap / deductedNetProfitTtm : null;
  const peValues = Array.isArray(valuationMetrics.peValues) ? valuationMetrics.peValues.filter((value) => Number.isFinite(value) && value > 0) : [];
  const peAnchors = [10, 25, 50, 75, 90].map((item) => ({ percentile: item, value: quantile(peValues, item / 100) }));
  const currentPePercentile = percentileRank(peValues, currentDeductedPe);

  const statementDates = annualFundamentals.slice(0, Math.max(DEFAULT_ANNUAL_REPORT_COUNT, args.annualCount)).map((item) => item.reportDate);
  const statementRows = [];
  for (const reportDate of statementDates) {
    const rows = await Promise.all([
      rowForStatement({ symbol: args.symbol, statement: 'income' }, reportDate),
      rowForStatement({ symbol: args.symbol, statement: 'balance' }, reportDate),
      rowForStatement({ symbol: args.symbol, statement: 'cash_flow' }, reportDate),
    ]);
    statementRows.push({ reportDate, income: rows[0], balance: rows[1], cashFlow: rows[2] });
  }

  const markedDividendEvents = markedDividends.map((marking) => marking.event);
  const eventNormalizedDividend = sumMarkedDividendEvents(markedDividendEvents);
  const normalizedDividend = eventNormalizedDividend ?? override?.normalizedDividend ?? null;
  const normalDps = normalizedDividend != null && totalShares != null && totalShares > 0 ? normalizedDividend / totalShares : null;
  const normalDividendSource = eventNormalizedDividend != null
    ? `用户标记：${readMarkedDividendSource(markedDividendEvents)}`
    : override?.normalizedDividend != null
      ? 'StockMetricOverride.normalizedDividend'
      : '未找到用户标记正常分红';
  const official = await prepareOfficialReports({ symbol: args.symbol, outDir, annualCount: args.annualCount, noDownloadReports: args.noDownloadReports });

  const lines = [
    `# ${universeItem.name}(${args.symbol}) LLM 研报证据包`,
    '',
    `生成时间：${new Date().toISOString()}`,
    `用户：${args.userId}`,
    '',
    '## 使用方式',
    '',
    '本文件只提供证据，不生成结论。请使用 `.github/prompts/stock-dividend-valuation.prompt.md` 作为唯一研报生成方法，逐条核对本证据包后再写入 `StockAiReport`。',
    '本证据包是五年基线，不是证据上限。LLM 解析时如果发现扣非利润、经营现金流、存货、应收、合同负债、资本开支、减值、投资收益、税费、股本、合并范围或分红有较大扰动，应按需继续下载并解析对应年报、中报、季报或公告；如果扰动年份早于当前窗口，可用更大的 `--annual-count` 重新生成证据。补不到或解释不足时，必须标为 `未识别/待跟踪`。',
    '',
    '## 1. 基础数据',
    '',
    mdTable(['项目', '值'], [
      ['名称', universeItem.name],
      ['行业', universeItem.sector],
      ['当前价格', price == null ? '—' : `${number(price)}元`],
      ['总股本', totalShares == null ? '—' : number(totalShares, 0)],
      ['当前市值', yi(marketCap)],
      ['财务缓存状态', fundamentalCache?.status ?? '—'],
      ['财务缓存警告', Array.isArray(fundamentalCache?.warnings) ? fundamentalCache.warnings.join('；') : '—'],
      ['估值缓存状态', valuationCache?.status ?? '—'],
      ['估值快照截至', dateText(valuationCache?.calculatedThroughSnapshotDate)],
    ]),
    '',
    '## 2. 扣非 PE 锚点',
    '',
    mdTable(['锚点', 'PE', '说明'], [
      ...peAnchors.map((item) => [`P${item.percentile}`, number(item.value), '周频扣非 PE 历史分位']),
      ['当前扣非 PE', number(currentDeductedPe), `当前分位 ${percent(currentPePercentile)}`],
    ]),
    '',
    '## 3. 利润与现金流',
    '',
    mdTable(['报告期', '扣非净利润', '归母净利润', '营业收入', '经营现金流', '资本开支', '自由现金流', 'OCF/扣非'], fundamentals.slice(0, 8).map((row) => {
      const fcf = row.operatingCashFlow != null && row.capitalExpenditure != null ? row.operatingCashFlow - row.capitalExpenditure : null;
      const ocfCoverage = row.operatingCashFlow != null && row.deductedNetProfit != null && row.deductedNetProfit > 0 ? row.operatingCashFlow / row.deductedNetProfit : null;
      return [row.reportName ?? dateText(row.reportDate), yi(row.deductedNetProfit), yi(row.netProfit), yi(row.revenue), yi(row.operatingCashFlow), yi(row.capitalExpenditure), yi(fcf), percent(ocfCoverage)];
    })),
    '',
    '## 4. 五年以上扣非利润历史',
    '',
    mdTable(['年报', '扣非净利润', '归母净利润', '营业收入', '净资产', '总资产'], annualFundamentals.map((row) => [row.reportName ?? dateText(row.reportDate), yi(row.deductedNetProfit), yi(row.netProfit), yi(row.revenue), yi(row.netAsset), yi(row.totalAssets)])),
    '',
    '## 5. 正常分红来源',
    '',
    mdTable(['项目', '值'], [
      ['正常 DPS', normalDps == null ? '—' : `${number(normalDps, 3)}元/股`],
      ['正常分红总额', yi(normalizedDividend)],
      ['来源', normalDividendSource],
    ]),
    '',
    '## 6. 三大表关键行（年报）',
    '',
    mdTable(['报告期', '毛利/营业利润线索', '存货', '应收账款', '合同负债', '经营现金流', '购建固定资产现金'], statementRows.map((row) => {
      const income = readRecord(row.income?.fields);
      const balance = readRecord(row.balance?.fields);
      const cashFlow = readRecord(row.cashFlow?.fields);
      return [
        row.income?.reportName ?? row.balance?.reportName ?? dateText(row.reportDate),
        `收入 ${yi(readNumber(income, 'revenue') ?? readNumber(income, 'total_revenue'))}；成本 ${yi(readNumber(income, 'oper_cost'))}；扣非 ${yi(readNumber(income, 'profit_dedt'))}`,
        yi(readNumber(balance, 'inventories')),
        yi(readNumber(balance, 'accounts_receiv')),
        yi(readNumber(balance, 'contract_liab')),
        yi(readNumber(cashFlow, 'n_cashflow_act')),
        yi(readNumber(cashFlow, 'c_pay_acq_const_fiolta')),
      ];
    })),
    '',
    '## 7. 官方年报材料',
    '',
    official.warnings.length ? `警告：${official.warnings.join('；')}` : `已尝试从巨潮资讯抓取最近 ${args.annualCount} 份年报。`,
    '',
    ...official.reports.flatMap((report) => [
      `### ${report.title}`,
      '',
      `公告日：${report.date ?? '—'}`,
      `PDF：${report.pdfPath ?? report.url}`,
      `文本：${report.textPath ?? '—'}`,
      '',
      ...(report.excerpts?.length ? report.excerpts.flatMap((item) => [`**${item.keyword}**：${item.excerpt}`, '']) : ['未抽取到关键词摘录。', '']),
    ]),
    '## 8. LLM 生成前必须核对的问题',
    '',
    '- 扣非 PE 与 headline PE 是否明显冲突？如冲突，说明会计原因。',
    '- 经营现金流/扣非净利润是否连续弱化？若是，定位到存货、应收、预付、税费、投资或分红。',
    '- 存货、合同负债、应收、毛利率、资本开支、减值、投资收益是否有反常变化？',
    '- 官方年报摘录是否足够解释异常？不够时标为未识别/待跟踪。',
    '- 分红收益率必须用正常 DPS / 价格，不得用覆盖率反推。',
  ];

  writeFileSync(outPath, `${lines.join('\n')}\n`);
  return outPath;
};

const main = async () => {
  const args = parseArgs();
  const outPath = await buildEvidence(args);
  console.log(`evidence written: ${outPath}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });