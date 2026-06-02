#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { setAppDatabaseUrl } from './database-url.mjs';

setAppDatabaseUrl();

const prisma = new PrismaClient();
const STOCK_UNIVERSE_PATH = new URL('../src/config/stock-universe.json', import.meta.url);
const REPORT_VERSION = 1;
const FUNDAMENTAL_DOMAIN = 'fundamental_latest';
const VALUATION_DOMAIN = 'valuation_weekly';

const TEMPLATE_BY_SYMBOL = {
  '603288': 'condiment',
  '600519': 'liquor',
  '000858': 'liquor',
  '000568': 'liquor',
  '600809': 'liquor',
  '000423': 'tcm',
  '000538': 'tcm',
  '000999': 'tcm',
  '600329': 'tcm',
  '600036': 'bank',
  '601288': 'bank',
};

const TEMPLATES = {
  condiment: {
    name: '调味品现金牛模板',
    instruction: '先证明渠道、回款和定价权，再讨论分红和估值；同业优先看调味品，不用泛消费代替。',
    checks: ['合同负债/收入与合同负债/总负债', '应收/收入与销售收现', '毛利率、销售费用率与产品矩阵', 'FCF 分红覆盖、PE 分位、PEG 和股息率'],
    risks: ['渠道预收下滑或压货回吐', '高端化无法兑现到毛利率', '成熟期增长低但估值仍按高成长定价'],
  },
  liquor: {
    name: '白酒品牌现金流模板',
    instruction: '重点看品牌定价权、渠道库存、预收、毛利率和分红，不只看利润增速。',
    checks: ['合同负债/预收', '毛利率和销售费用率', '经营现金流/扣非利润', 'PE、股息率和增长中枢'],
    risks: ['批价下行和渠道库存反噬', '费用换增长', '高估值遇到低增长形成 PE 和 E 双杀'],
  },
  tcm: {
    name: '中药品牌与核心利润模板',
    instruction: '剥离公允价值等噪音，重点看核心利润、品牌品种、渠道和药材成本。',
    checks: ['扣非与归母差异', '毛利率和销售费用率', '经营现金流/扣非利润', '存货、应收和药材成本压力'],
    risks: ['集采或医保控费压低核心品种', '销售费用驱动增长但现金流不匹配', '投资资产波动扭曲利润判断'],
  },
  bank: {
    name: '银行资产质量与资本约束模板',
    instruction: '银行不用制造业 FCF 框架，重点看 PB、ROE、股息率、资产质量和资本约束。',
    checks: ['PB 与 ROE 是否匹配', '净息差、资产质量和拨备', '核心一级资本与分红约束', '地产、城投、零售贷款风险'],
    risks: ['资产质量滞后暴露', '净息差继续收窄', '资本不足压制增长和分红'],
  },
  defaultConsumer: {
    name: '通用非金融现金流模板',
    instruction: '使用通用非金融模板，先看利润现金含量、ROE、分红覆盖，再看估值赔率。',
    checks: ['经营现金流/扣非利润', '销售收现、应收和存货', '扣非 ROE 和杜邦拆解', 'FCF 分红覆盖、PE 分位、PEG 和股息率'],
    risks: ['利润现金含量下降', 'ROE 靠杠杆或一次性因素维持', '分红超过自由现金流承受力'],
  },
};

const FRAMEWORKS = [
  { title: '通胀中的赢家：上下游占款和经营霸权', instruction: '从应付、预收、应收和经营现金流判断产业链话语权。' },
  { title: 'P = PE * E：收益来源拆解', instruction: '把未来收益拆成盈利增长、估值变化和分红贡献。' },
  { title: '组合与再平衡', instruction: '同时给出单股判断和组合位置，不假设每只股票都必须立刻上涨。' },
  { title: '追高排除规则', instruction: '大涨后调整不足的标的只能观察，不能因为回撤短暂就当作便宜。' },
  { title: '品牌、配方、工艺和消费心智', instruction: '消费股也要把品牌和渠道视为可持续竞争力。' },
];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const symbols = [];
  let userId = null;
  let dryRun = false;
  let allUsers = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--symbols') {
      while (args[index + 1] && !args[index + 1].startsWith('--')) {
        symbols.push(args[index + 1].trim().toUpperCase());
        index += 1;
      }
    } else if (arg === '--user-id') {
      userId = Number(args[index + 1]);
      index += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--all-users') {
      allUsers = true;
    }
  }

  return { symbols: symbols.filter(Boolean), userId: Number.isFinite(userId) ? userId : null, dryRun, allUsers };
};

const loadUniverse = () => JSON.parse(readFileSync(STOCK_UNIVERSE_PATH, 'utf8'));

const readRecord = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const readNumber = (record, key) => {
  const value = record?.[key];
  const numberValue = typeof value === 'number' ? value : Number(value ?? Number.NaN);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const readString = (record, key) => typeof record?.[key] === 'string' ? record[key] : null;
const formatDateKey = (date = new Date()) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
const startOfLocalDay = (date = new Date()) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};
const formatDate = (value) => {
  if (!value) return '未知';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

const yi = (value) => value == null ? '—' : `${(value / 1e8).toFixed(Math.abs(value) >= 1e10 ? 1 : 2)}亿`;
const money = (value) => value == null ? '—' : `${value.toFixed(value >= 100 ? 1 : 2)}元`;
const number = (value, digits = 2) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
const percent = (value, digits = 1) => value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
const signedPercent = (value, digits = 1) => value == null || !Number.isFinite(value) ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;

const percentileRank = (values, value) => {
  if (!values.length || value == null || !Number.isFinite(value)) return null;
  const sorted = values.filter((item) => typeof item === 'number' && Number.isFinite(item) && item > 0).sort((left, right) => left - right);
  if (!sorted.length) return null;
  return sorted.filter((item) => item <= value).length / sorted.length;
};

const cagrFromAnnuals = (annuals, field) => {
  const latest = annuals.find((row) => row[field] != null && row[field] > 0);
  if (!latest) return { value: null, years: null };
  const latestYear = latest.reportDate.getUTCFullYear();
  for (let years = 5; years >= 1; years -= 1) {
    const base = annuals.find((row) => row.reportDate.getUTCFullYear() === latestYear - years && row[field] != null && row[field] > 0);
    if (base) return { value: (latest[field] / base[field]) ** (1 / years) - 1, years };
  }
  return { value: null, years: null };
};

const field = (fields, key) => {
  const record = readRecord(fields);
  const value = record[key];
  const numberValue = typeof value === 'number' ? value : Number(value ?? Number.NaN);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const buildLatestData = async (userId, item) => {
  const symbol = item.symbol;
  const [quote, override, markedDividends, fundamentals, incomeRows, cashFlowRows, latestBalance, caches, latestSnapshot] = await Promise.all([
    prisma.stockQuote.findUnique({ where: { userId_symbol: { userId, symbol } } }),
    prisma.stockMetricOverride.findUnique({ where: { userId_symbol: { userId, symbol } } }).catch(() => null),
    prisma.stockDividendMarking.findMany({
      where: { userId, countTowardNormalizedDividend: true, event: { symbol } },
      include: { event: true },
      orderBy: { eventId: 'asc' },
    }),
    prisma.stockFundamental.findMany({ where: { symbol }, orderBy: { reportDate: 'desc' } }),
    prisma.stockFinancialStatement.findMany({ where: { symbol, statement: 'income' }, orderBy: { reportDate: 'desc' } }),
    prisma.stockFinancialStatement.findMany({ where: { symbol, statement: 'cash_flow' }, orderBy: { reportDate: 'desc' } }),
    prisma.stockFinancialStatement.findFirst({ where: { symbol, statement: 'balance', reportName: { contains: '年报' } }, orderBy: { reportDate: 'desc' } }),
    prisma.stockMetricCache.findMany({ where: { symbol, domain: { in: [FUNDAMENTAL_DOMAIN, VALUATION_DOMAIN] } } }),
    prisma.stockValuationSnapshot.findFirst({ where: { symbol, period: 'WEEK' }, orderBy: { tradeDate: 'desc' } }),
  ]);

  const cacheByDomain = new Map(caches.map((cache) => [cache.domain, cache]));
  const fundamentalCache = cacheByDomain.get(FUNDAMENTAL_DOMAIN) ?? null;
  const valuationCache = cacheByDomain.get(VALUATION_DOMAIN) ?? null;
  const fundamentalMetrics = readRecord(fundamentalCache?.metrics);
  const valuationMetrics = readRecord(valuationCache?.metrics);
  const latestFundamental = fundamentals[0] ?? null;
  const annuals = fundamentals.filter((row) => row.reportDate.getUTCMonth() === 11).sort((left, right) => right.reportDate.getTime() - left.reportDate.getTime());
  const latestIncome = incomeRows[0] ?? null;
  const latestCashFlow = cashFlowRows[0] ?? null;

  const currentPrice = quote?.currentPrice ?? latestSnapshot?.close ?? null;
  const totalShares = readNumber(fundamentalMetrics, 'totalShares') ?? latestFundamental?.totalShares ?? latestSnapshot?.totalShares ?? null;
  const marketCap = currentPrice != null && totalShares != null && totalShares > 0 ? currentPrice * totalShares : latestSnapshot?.totalMarketCap ?? null;
  const revenueTtm = readNumber(fundamentalMetrics, 'revenueTtm');
  const netProfitTtm = readNumber(fundamentalMetrics, 'netProfitTtm');
  const deductedNetProfitTtm = readNumber(fundamentalMetrics, 'deductedNetProfitTtm');
  const operatingCashFlowTtm = readNumber(fundamentalMetrics, 'operatingCashFlowTtm');
  const capitalExpenditureTtm = readNumber(fundamentalMetrics, 'capitalExpenditureTtm');
  const freeCashFlowTtm = operatingCashFlowTtm != null && capitalExpenditureTtm != null ? operatingCashFlowTtm - capitalExpenditureTtm : null;
  const netAsset = readNumber(fundamentalMetrics, 'netAsset') ?? latestFundamental?.netAsset ?? null;
  const totalAssets = readNumber(fundamentalMetrics, 'totalAssets') ?? latestFundamental?.totalAssets ?? null;
  const latestAnnualDeducted = annuals[0]?.deductedNetProfit ?? readNumber(fundamentalMetrics, 'latestAnnualDeductedNetProfit');
  const cagr = cagrFromAnnuals(annuals, 'deductedNetProfit');
  const deductedPeTtm = marketCap != null && deductedNetProfitTtm != null && deductedNetProfitTtm > 0 ? marketCap / deductedNetProfitTtm : null;
  const deductedPeAnnual = marketCap != null && latestAnnualDeducted != null && latestAnnualDeducted > 0 ? marketCap / latestAnnualDeducted : null;
  const pb = marketCap != null && netAsset != null && netAsset > 0 ? marketCap / netAsset : latestSnapshot?.pb ?? null;
  const roeDeductedTtm = deductedNetProfitTtm != null && netAsset != null && netAsset > 0 ? deductedNetProfitTtm / netAsset : null;
  const ocfToDeducted = operatingCashFlowTtm != null && deductedNetProfitTtm != null && deductedNetProfitTtm > 0 ? operatingCashFlowTtm / deductedNetProfitTtm : null;
  const goodwill = latestBalance ? field(latestBalance.fields, 'goodwill') ?? 0 : null;
  const goodwillToNetAsset = goodwill != null && netAsset != null && netAsset > 0 ? goodwill / netAsset : null;
  const goodwillToTotalAssets = goodwill != null && totalAssets != null && totalAssets > 0 ? goodwill / totalAssets : null;
  const markedDividend = markedDividends.reduce((sum, marking) => {
    const event = marking.event;
    if (!event.cashPerTen || event.cashPerTen <= 0 || !event.dividendBaseShares || event.dividendBaseShares <= 0) return sum;
    return sum + event.cashPerTen / 10 * event.dividendBaseShares;
  }, 0);
  const normalizedDividend = markedDividend > 0 ? markedDividend : override?.normalizedDividend ?? null;
  const dividendYield = marketCap != null && normalizedDividend != null && normalizedDividend > 0 ? normalizedDividend / marketCap : null;
  const fcfDividendCoverage = freeCashFlowTtm != null && normalizedDividend != null && normalizedDividend > 0 ? freeCashFlowTtm / normalizedDividend : null;
  const peValues = Array.isArray(valuationMetrics.peValues) ? valuationMetrics.peValues : [];
  const pbValues = Array.isArray(valuationMetrics.pbValues) ? valuationMetrics.pbValues : [];
  const pePercentile = percentileRank(peValues, deductedPeTtm);
  const pbPercentile = percentileRank(pbValues, pb);
  const peg = deductedPeAnnual != null && cagr.value != null && cagr.value !== 0 ? deductedPeAnnual / (cagr.value * 100) : null;

  return {
    symbol,
    name: item.name,
    sector: item.sector,
    currentPrice,
    marketCap,
    latestSnapshotDate: latestSnapshot?.tradeDate ?? null,
    financialReportName: fundamentalCache?.calculatedThroughReportName ?? latestFundamental?.reportName ?? null,
    financialReportDate: fundamentalCache?.calculatedThroughReportDate ?? latestFundamental?.reportDate ?? null,
    valuationSnapshotDate: valuationCache?.calculatedThroughSnapshotDate ?? latestSnapshot?.tradeDate ?? null,
    revenueTtm,
    netProfitTtm,
    deductedNetProfitTtm,
    latestAnnualDeducted,
    operatingCashFlowTtm,
    capitalExpenditureTtm,
    freeCashFlowTtm,
    netAsset,
    totalAssets,
    totalShares,
    deductedPeTtm,
    deductedPeAnnual,
    pb,
    roeDeductedTtm,
    ocfToDeducted,
    cagr,
    peg,
    goodwill,
    goodwillToNetAsset,
    goodwillToTotalAssets,
    normalizedDividend,
    dividendYield,
    fcfDividendCoverage,
    pePercentile,
    pbPercentile,
    peSampleCount: peValues.length,
    pbSampleCount: pbValues.length,
    latestIncomeFields: readRecord(latestIncome?.fields),
    latestCashFlowFields: readRecord(latestCashFlow?.fields),
    warnings: [
      ...(Array.isArray(fundamentalCache?.warnings) ? fundamentalCache.warnings : []),
      ...(Array.isArray(valuationCache?.warnings) ? valuationCache.warnings : []),
      normalizedDividend == null ? '未找到用户标记的常态分红或 normalizedDividend 覆盖，股息率不做推断。' : null,
    ].filter(Boolean),
  };
};

const templateFor = (data) => TEMPLATES[TEMPLATE_BY_SYMBOL[data.symbol] ?? (data.sector === '中药' ? 'tcm' : 'defaultConsumer')];

const qualityLabel = (data) => {
  if (data.symbol === '600036' || data.symbol === '601288') return data.pb != null && data.pb < 1 ? '低 PB 银行，重点看资产质量、ROE 和分红可持续性。' : '银行标的，估值判断必须服从资产质量和资本约束。';
  if (data.ocfToDeducted != null && data.ocfToDeducted >= 1.2 && data.roeDeductedTtm != null && data.roeDeductedTtm >= 0.15) return '现金含量和扣非 ROE 均较强，属于值得继续体检的优质样本。';
  if (data.ocfToDeducted != null && data.ocfToDeducted < 0.8) return '利润现金含量偏弱，需要先解释经营现金流缺口。';
  if (data.deductedNetProfitTtm != null && data.deductedNetProfitTtm <= 0) return '扣非利润为负或不可用，不能给出积极估值结论。';
  return '基本面需要结合现金流、ROE、分红覆盖和估值一起判断。';
};

const valuationLabel = (data) => {
  if (data.deductedPeTtm == null) return '扣非 PE TTM 缺少严格输入，估值只能作为观察项。';
  if (data.pePercentile != null && data.pePercentile <= 0.25) return '扣非 PE 处于历史较低区域，但仍需检查盈利中枢是否下修。';
  if (data.pePercentile != null && data.pePercentile >= 0.75) return '扣非 PE 处于历史偏高区域，必须依赖更高质量增长或分红来消化估值。';
  return '扣非 PE 处于历史中部区域，收益更依赖盈利增长和分红。';
};

const reportSummary = (data) => [
  `${data.name}最新财务截至${data.financialReportName ?? '未知报告期'}。`,
  `扣非 PE TTM ${number(data.deductedPeTtm, 1)}，PE 分位 ${percent(data.pePercentile)}，扣非 ROE TTM ${percent(data.roeDeductedTtm)}。`,
  qualityLabel(data),
].join('');

const metricTable = (data) => [
  '| 指标 | 数值 | 说明 |',
  '| --- | ---: | --- |',
  `| 当前价 | ${money(data.currentPrice)} | 行情/估值快照截至 ${formatDate(data.latestSnapshotDate)} |`,
  `| 当前市值 | ${yi(data.marketCap)} | 价格 * persisted totalShares；不使用 vendor quote market cap |`,
  `| 收入 TTM | ${yi(data.revenueTtm)} | 财务数据截至 ${data.financialReportName ?? '未知'} |`,
  `| 归母净利润 TTM | ${yi(data.netProfitTtm)} | 用于观察非经常性扰动 |`,
  `| 扣非净利润 TTM | ${yi(data.deductedNetProfitTtm)} | 估值主口径 |`,
  `| 经营现金流 TTM | ${yi(data.operatingCashFlowTtm)} | 现金含量来源 |`,
  `| 自由现金流 TTM | ${yi(data.freeCashFlowTtm)} | OCF - 资本开支 |`,
  `| OCF/扣非 | ${number(data.ocfToDeducted, 2)} | 长期大于 1 更健康 |`,
  `| 扣非 ROE TTM | ${percent(data.roeDeductedTtm)} | 股东资本主业回报 |`,
  `| 扣非 PE TTM | ${number(data.deductedPeTtm, 1)} | 当前市值 / 扣非 TTM |`,
  `| PB | ${number(data.pb, 2)} | 当前市值 / 净资产 |`,
  `| PE 分位 | ${percent(data.pePercentile)} | 样本 ${data.peSampleCount} 周 |`,
  `| PB 分位 | ${percent(data.pbPercentile)} | 样本 ${data.pbSampleCount} 周 |`,
  `| 扣非 CAGR | ${data.cagr.years ? `${percent(data.cagr.value)} / ${data.cagr.years}年` : '—'} | 用年度扣非利润保守估算 |`,
  `| PEG扣 | ${number(data.peg, 2)} | 年度扣非 PE / CAGR百分数 |`,
  `| 常态分红 | ${yi(data.normalizedDividend)} | 仅用用户标记/覆盖，不从未标记事件推断 |`,
  `| 股息率 | ${percent(data.dividendYield)} | 常态分红 / 当前市值 |`,
  `| FCF/分红 | ${number(data.fcfDividendCoverage, 2)} | 分红安全垫 |`,
  `| 商誉/净资产 | ${percent(data.goodwillToNetAsset)} | 并购减值风险 |`,
].join('\n');

const buildEvidenceBullets = (data) => {
  const bullets = [];
  bullets.push(`财务数据截至 ${data.financialReportName ?? '未知'}，估值快照截至 ${formatDate(data.valuationSnapshotDate)}。`);
  bullets.push(`扣非净利润 TTM 为 ${yi(data.deductedNetProfitTtm)}，归母净利润 TTM 为 ${yi(data.netProfitTtm)}。`);
  bullets.push(`经营现金流 TTM 为 ${yi(data.operatingCashFlowTtm)}，自由现金流 TTM 为 ${yi(data.freeCashFlowTtm)}，OCF/扣非为 ${number(data.ocfToDeducted, 2)}。`);
  bullets.push(`扣非 PE TTM 为 ${number(data.deductedPeTtm, 1)}，历史 PE 分位为 ${percent(data.pePercentile)}；PB 为 ${number(data.pb, 2)}，PB 分位为 ${percent(data.pbPercentile)}。`);
  bullets.push(`常态分红为 ${yi(data.normalizedDividend)}，股息率为 ${percent(data.dividendYield)}，FCF/分红为 ${number(data.fcfDividendCoverage, 2)}。`);
  if (data.goodwillToNetAsset != null && data.goodwillToNetAsset > 0.05) bullets.push(`商誉为 ${yi(data.goodwill)}，占净资产 ${percent(data.goodwillToNetAsset)}，需要持续检查减值风险。`);
  return bullets.map((item) => `- ${item}`).join('\n');
};

const buildJudgmentBullets = (data, template) => {
  const bullets = [
    qualityLabel(data),
    valuationLabel(data),
  ];
  if (data.fcfDividendCoverage != null) {
    bullets.push(data.fcfDividendCoverage >= 1 ? '自由现金流能覆盖当前常态分红，收息逻辑有现金流支撑。' : '自由现金流暂不能充分覆盖常态分红，不能只看表面股息率。');
  } else {
    bullets.push('常态分红或自由现金流输入不足，分红安全垫暂不做替代估计。');
  }
  if (data.peg != null) {
    bullets.push(data.peg <= 1.5 ? `PEG扣 ${number(data.peg, 2)}，估值与历史扣非增长相对匹配。` : `PEG扣 ${number(data.peg, 2)}，如果未来增长中枢下降，估值消化压力偏大。`);
  } else {
    bullets.push('PEG 缺少可用的正扣非 CAGR 输入，不能机械套成长股估值。');
  }
  bullets.push(`本报告使用“${template.name}”：${template.instruction}`);
  return bullets.map((item) => `- ${item}`).join('\n');
};

const buildVerificationSection = (template) => template.checks.map((item) => `- ${item}`).join('\n');
const buildRiskSection = (data, template) => [
  ...template.risks,
  ...(data.warnings.length ? data.warnings : []),
].map((item) => `- ${item}`).join('\n');

const buildReport = (data) => {
  const template = templateFor(data);
  const frameworkText = FRAMEWORKS.map((item) => `- **${item.title}**：${item.instruction}`).join('\n');
  const title = `${data.name}基本面研报：${data.financialReportName ?? '最新财报'}更新`;
  const summary = reportSummary(data).slice(0, 480);
  const content = [
    `# ${data.name}（${data.symbol}）基本面研报`,
    '',
    `> 本报告由本地规则根据既有股票分析 prompt、财务三表、估值快照、用户标记分红和框架卡片生成；不调用在线 LLM。`,
    '',
    '## 一句话结论',
    '',
    `${qualityLabel(data)} ${valuationLabel(data)}`,
    '',
    '## 数据边界',
    '',
    `- 财务数据截至：${data.financialReportName ?? '未知'}（${formatDate(data.financialReportDate)}）`,
    `- 估值快照截至：${formatDate(data.valuationSnapshotDate)}`,
    `- 当前价格来源：${data.currentPrice == null ? '缺失' : money(data.currentPrice)}`,
    `- 常态分红口径：只使用用户标记正常分红或 normalizedDividend 覆盖；缺失时不推断。`,
    '',
    '## 核心指标',
    '',
    metricTable(data),
    '',
    '## 证据',
    '',
    buildEvidenceBullets(data),
    '',
    '## 判断',
    '',
    buildJudgmentBullets(data, template),
    '',
    '## 估值：P = PE * E',
    '',
    `- **E**：扣非净利润 TTM 为 ${yi(data.deductedNetProfitTtm)}，近 ${data.cagr.years ?? '—'} 年扣非 CAGR 为 ${percent(data.cagr.value)}。`,
    `- **PE**：扣非 PE TTM 为 ${number(data.deductedPeTtm, 1)}，历史分位 ${percent(data.pePercentile)}。`,
    `- **分红**：常态股息率 ${percent(data.dividendYield)}，FCF/分红 ${number(data.fcfDividendCoverage, 2)}。`,
    `- **组合含义**：低分位不是自动买入，高分位也不是自动卖出；需要 E 的质量和分红现金流一起确认。`,
    '',
    '## 使用的框架卡片',
    '',
    frameworkText,
    '',
    '## 接下来需要验证',
    '',
    buildVerificationSection(template),
    '',
    '## 可能在哪里死掉',
    '',
    buildRiskSection(data, template),
  ].join('\n');

  return { title, summary, content };
};

const upsertReport = async (userId, data, reportDate, dryRun) => {
  const report = buildReport(data);
  const slug = `stock-${data.symbol}-${formatDateKey(reportDate)}-v${REPORT_VERSION}`;
  const payload = {
    userId,
    symbol: data.symbol,
    slug,
    title: report.title,
    summary: report.summary,
    content: report.content,
    sourceLinks: [
      { title: `${data.name}股票详情`, url: `/meow/stocks/${encodeURIComponent(data.symbol)}` },
      { title: `${data.name}财务报表`, url: `/meow/stocks/${encodeURIComponent(data.symbol)}/financials` },
    ],
    reportDate,
  };

  if (dryRun) return { slug, title: report.title };

  await prisma.stockAiReport.upsert({
    where: { userId_slug: { userId, slug } },
    create: payload,
    update: {
      title: payload.title,
      summary: payload.summary,
      content: payload.content,
      sourceLinks: payload.sourceLinks,
      reportDate: payload.reportDate,
      updatedAt: new Date(),
    },
  });
  return { slug, title: report.title };
};

const main = async () => {
  const args = parseArgs();
  const universe = loadUniverse();
  const selectedSymbols = args.symbols.length > 0 ? new Set(args.symbols) : null;
  const selectedUniverse = selectedSymbols ? universe.filter((item) => selectedSymbols.has(item.symbol)) : universe;

  if (!args.userId && !args.allUsers) {
    throw new Error('Pass --user-id <id> to generate reports for one account, or --all-users to intentionally generate for every account.');
  }

  const users = args.allUsers
    ? await prisma.user.findMany({ orderBy: { id: 'asc' } })
    : await prisma.user.findMany({ where: { id: args.userId }, orderBy: { id: 'asc' } });

  if (users.length === 0) throw new Error(args.userId ? `user ${args.userId} not found` : 'no users found');
  if (selectedUniverse.length === 0) throw new Error('no symbols selected');

  const reportDate = startOfLocalDay();
  let count = 0;
  for (const user of users) {
    for (const item of selectedUniverse) {
      const data = await buildLatestData(user.id, item);
      const result = await upsertReport(user.id, data, reportDate, args.dryRun);
      count += 1;
      console.log(`${args.dryRun ? '[dry-run] ' : ''}user=${user.id} ${item.symbol} ${item.name} -> ${result.slug}`);
    }
  }
  console.log(`done reports=${count} users=${users.length} symbols=${selectedUniverse.length}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });