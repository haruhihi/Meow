import { Prisma, StockFrameworkArticle } from '@prisma/client';
import { prisma } from '@libs/prisma';
import { getArticleById } from '@libs/article-db';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import {
  IStockAiPromptArticle,
  IStockAiFrameworkCard,
  IStockAiPromptMetric,
  IStockAiPromptReq,
  IStockAiPromptRes,
  IStockPortfolioSymbolSummary,
} from '@dtos/meow';
import { buildStockPortfolio, normalizeSymbol } from '../../helpers';
import { GLOBAL_FRAMEWORK_SYMBOL, stockFrameworkArticleConfig, StockFrameworkArticleConfigItem } from '../../../../../config/stock-ai-framework';
import { stockFrameworkCardByArticleId } from '../../../../../config/stock-ai-framework-cards';
import { formatStockReportTemplateForPrompt, getStockReportTemplate, StockReportPeer, StockReportTemplate } from '../../../../../config/stock-report-templates';

type MarkedDividendEvent = Prisma.StockDividendMarkingGetPayload<{ include: { event: true } }>;

const formatMoney = (value?: number | null) => (value == null ? '未知' : `${Number(value.toFixed(2))} 元`);
const formatNumber = (value?: number | null) => (value == null ? '未知' : Number(value.toFixed(4)).toString());
const formatPercent = (value?: number | null) => (value == null ? '未知' : `${(value * 100).toFixed(2)}%`);
const formatDate = (value?: Date | string | null) => {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const toInputJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const readStatementNumber = (fields: Prisma.JsonValue | undefined, key: string) => {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  const value = fields[key];
  const raw = Array.isArray(value) ? value[0] : value;
  const numberValue = typeof raw === 'number' ? raw : Number(raw ?? Number.NaN);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const formatRatio = (value: number | null) => (value == null || !Number.isFinite(value) ? '缺数据' : value.toFixed(2));
const formatRatioPercent = (value: number | null) => (value == null || !Number.isFinite(value) ? '缺数据' : `${(value * 100).toFixed(1)}%`);

const divide = (numerator: number | null, denominator: number | null) => {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
};

const normalizeConfigItems = (symbol: string): { symbol: string; item: StockFrameworkArticleConfigItem }[] => [
  ...stockFrameworkArticleConfig.global.map((item) => ({ symbol: GLOBAL_FRAMEWORK_SYMBOL, item })),
  ...(stockFrameworkArticleConfig.bySymbol[symbol] ?? []).map((item) => ({ symbol, item })),
];

const syncConfiguredArticles = async (userId: number, symbol: string) => {
  const entries = normalizeConfigItems(symbol);
  await Promise.all(entries.map(async ({ symbol: entrySymbol, item }) => {
    if (!/^\d+$/.test(item.articleId)) return;
    await prisma.stockFrameworkArticle.upsert({
      where: {
        userId_symbol_articleId: {
          userId,
          symbol: entrySymbol,
          articleId: item.articleId,
        },
      },
      create: {
        userId,
        symbol: entrySymbol,
        articleId: item.articleId,
        reason: item.reason?.trim() || null,
        tags: item.tags ? toInputJson(item.tags) : undefined,
        weight: item.weight ?? 100,
      },
      update: {
        reason: item.reason?.trim() || null,
        tags: item.tags ? toInputJson(item.tags) : Prisma.JsonNull,
        weight: item.weight ?? 100,
      },
    });
  }));
};

const normalizeTags = (value: Prisma.JsonValue | null): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

const loadFrameworkArticles = async (mappings: StockFrameworkArticle[]): Promise<IStockAiPromptArticle[]> => {
  const articles = await Promise.all(mappings.map(async (mapping) => {
    const article = await getArticleById(mapping.articleId);
    if (!article) return null;
    return {
      articleId: mapping.articleId,
      title: article.title,
      source: article.source,
      publishDate: article.publishDate,
      reason: mapping.reason,
      tags: [...new Set([...normalizeTags(mapping.tags), ...article.tags])],
      excerpt: article.excerpt,
      body: '',
    };
  }));

  return articles.filter((article): article is IStockAiPromptArticle => article !== null);
};

const loadFrameworkCards = (articles: IStockAiPromptArticle[]): IStockAiFrameworkCard[] =>
  articles
    .map((article) => stockFrameworkCardByArticleId.get(article.articleId))
    .filter((card): card is IStockAiFrameworkCard => card !== undefined)
    .map((card) => ({
      articleId: card.articleId,
      title: card.title,
      tags: card.tags,
      principles: card.principles,
      checks: card.checks,
      promptInstruction: card.promptInstruction,
    }));

const metric = (label: string, value: string, interpretation: string): IStockAiPromptMetric => ({ label, value, interpretation });

const buildMetrics = (summary: IStockPortfolioSymbolSummary): IStockAiPromptMetric[] => [
  metric('市值', formatMoney(summary.marketValue), '当前持仓口径下的该股票市场价值，用于估算持仓权重。'),
  metric('常态股息率', formatPercent(summary.normalizedDividendYield), '基于你标记的常态分红计算，不能把高股息率自动当成安全。'),
  metric('扣非 PE', formatNumber(summary.deductedPe), '静态扣非口径估值，需结合现金流质量和增长稳定性。'),
  metric('扣非 PE TTM', formatNumber(summary.deductedPeTtm), '滚动扣非口径估值，适合观察最近四个季度盈利质量。'),
  metric(`扣非净利润 CAGR${summary.deductedNetProfitCagrYears ?? 5}`, formatPercent(summary.deductedNetProfitCagr5), '用于计算扣非 PEG；若 CAGR5 基期为负或缺失，会改用较近的正基期，仍需谨慎外推。'),
  metric('扣非 PEG', formatNumber(summary.deductedPeg), `扣非 PE / 扣非净利润 CAGR${summary.deductedNetProfitCagrYears ?? 5}，用于判断估值是否被增长支撑。`),
  metric('PB', formatNumber(summary.pb), '资产定价口径，中药品牌型公司不能只按 PB 判断便宜。'),
  metric('扣非 ROE TTM', formatPercent(summary.deductedRoeTtm), '需要用杜邦拆解判断来自净利率、周转率还是杠杆。'),
  metric('商誉', formatMoney(summary.goodwill), '并购形成的资产，商誉较高时需要关注减值风险。'),
  metric('商誉/净资产', formatPercent(summary.goodwillToNetAsset), '衡量商誉减值对股东权益和利润表的潜在冲击。'),
  metric('自由现金流分红覆盖', formatNumber(summary.fcfDividendCoverage), '自由现金流 / 你标记的常态分红，低于 1 需要重点解释。'),
  metric('经营现金流 / 扣非净利润', formatNumber(summary.operatingCashFlowToDeductedNetProfit), '用于判断利润是否变成现金；长期显著低于 1 是风险信号。'),
];

const buildPeerComparisonText = async (peers: StockReportPeer[]) => {
  if (peers.length === 0) return '暂无已配置横评股票池。';

  const rows = await Promise.all(peers.map(async (peer) => {
    if (peer.listed === false) {
      return `| ${peer.symbol} ${peer.name} | 非上市质性对手 | ${peer.role} | - | - | - | - | - | - | - |`;
    }

    const statements = await prisma.stockFinancialStatement.findMany({
      where: {
        symbol: peer.symbol,
        reportName: { contains: '年报' },
        statement: { in: ['income', 'balance', 'cash_flow'] },
      },
      orderBy: [{ reportDate: 'desc' }, { statement: 'asc' }],
      take: 9,
    });

    const periods = new Map<string, Record<string, Prisma.JsonValue>>();
    statements.forEach((statement) => {
      const key = statement.reportDate.toISOString();
      periods.set(key, {
        ...(periods.get(key) ?? {}),
        [statement.statement]: statement.fields,
      });
    });

    const latest = [...periods.entries()].find(([, item]) => item.income && item.balance && item.cash_flow);
    if (!latest) return `| ${peer.symbol} ${peer.name} | 缺本地三表 | ${peer.role} | - | - | - | - | - | - | - |`;

    const [reportDate, item] = latest;
    const income = item.income;
    const balance = item.balance;
    const cashFlow = item.cash_flow;
    const revenue = readStatementNumber(income, 'revenue');
    const deductedNetProfit = readStatementNumber(income, 'net_profit_after_nrgal_atsolc');
    const totalLiability = readStatementNumber(balance, 'total_liab');
    const equity = readStatementNumber(balance, 'total_quity_atsopc');
    const contractLiability = readStatementNumber(balance, 'contract_liabilities');
    const receivables = readStatementNumber(balance, 'ar_and_br');
    const inventory = readStatementNumber(balance, 'inventory');
    const salesCash = readStatementNumber(cashFlow, 'cash_received_of_sales_service');
    const operatingCashFlow = readStatementNumber(cashFlow, 'ncf_from_oa');
    const reportYear = new Date(reportDate).getFullYear();

    return [
      `| ${peer.symbol} ${peer.name}`,
      `${reportYear}年报`,
      peer.role,
      formatRatioPercent(divide(contractLiability, totalLiability)),
      formatRatioPercent(divide(contractLiability, revenue)),
      formatRatioPercent(divide(receivables, revenue)),
      formatRatioPercent(divide(inventory, revenue)),
      formatRatio(divide(salesCash, revenue)),
      formatRatio(divide(operatingCashFlow, deductedNetProfit)),
      `${formatRatioPercent(divide(deductedNetProfit, equity))} |`,
    ].join(' | ');
  }));

  return [
    '| 公司 | 本地数据期 | 横评角色 | 合同负债/总负债 | 合同负债/收入 | 应收/收入 | 存货/收入 | 销售收现/收入 | OCF/扣非 | 扣非ROE |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|',
    ...rows,
  ].join('\n');
};

const buildPrompt = ({
  summary,
  metrics,
  fundamentals,
  dividendEvents,
  articles,
  frameworkCards,
  reportTemplate,
  peerComparisonText,
}: {
  summary: IStockPortfolioSymbolSummary;
  metrics: IStockAiPromptMetric[];
  fundamentals: Awaited<ReturnType<typeof prisma.stockFundamental.findMany>>;
  dividendEvents: MarkedDividendEvent[];
  articles: IStockAiPromptArticle[];
  frameworkCards: IStockAiFrameworkCard[];
  reportTemplate: StockReportTemplate;
  peerComparisonText: string;
}) => `你是一名偏长期、保守、重视现金流和分红可持续性的基本面投资分析助手。

我的投资目标：
1. 以持股收息为主，长期持有优秀企业。
2. 分红可以复投，也可以在未来补充现金流。
3. 不追求短期股价预测，更关注企业是否持续赚到真钱、分红是否可靠、估值是否有安全边际。
4. 我学习并参考「盛京剑客」的投资框架。请把我提供的相关文章作为分析框架来源之一，但不要机械复述文章，要把文章观点转化为可验证的分析维度。

公司：${summary.symbol} ${summary.name}
行业/分组：${summary.sector}
当前价：${formatMoney(summary.currentPrice)}
持仓股数：${formatNumber(summary.quantity)}
持仓市值：${formatMoney(summary.marketValue)}
持仓账户：${summary.accounts.join('、') || '未知'}

我已计算的关键指标：
${metrics.map((item) => `- ${item.label}：${item.value}。${item.interpretation}`).join('\n')}

最近财务数据（按报告期倒序）：
${fundamentals.map((item) => `- ${formatDate(item.reportDate)} ${item.reportName ?? ''}：营收 ${formatMoney(item.revenue)}，营收TTM ${formatMoney(item.revenueTtm)}，扣非净利润 ${formatMoney(item.deductedNetProfit)}，扣非净利润TTM ${formatMoney(item.deductedNetProfitTtm)}，归母净利润 ${formatMoney(item.netProfit)}，经营现金流 ${formatMoney(item.operatingCashFlow)}，经营现金流TTM ${formatMoney(item.operatingCashFlowTtm)}，资本开支 ${formatMoney(item.capitalExpenditure)}，资本开支TTM ${formatMoney(item.capitalExpenditureTtm)}，净资产 ${formatMoney(item.netAsset)}，总资产 ${formatMoney(item.totalAssets)}`).join('\n') || '- 暂无财务数据'}

我标记计入常态分红的事件：
${dividendEvents.map((marking) => `- ${marking.event.reportPeriod ?? '未知报告期'}：${marking.event.description ?? '暂无描述'}，除权除息 ${formatDate(marking.event.exDividendDate)}，现金分红/10股 ${formatNumber(marking.event.cashPerTen)}，标记备注 ${marking.note ?? '无'}`).join('\n') || '- 暂无标记分红事件'}

盛京剑客方法论卡片：
${frameworkCards.map((card) => `## ${card.title}\n文章ID：${card.articleId}\n标签：${card.tags.join('、') || '无'}\n核心原则：\n${card.principles.map((item) => `- ${item}`).join('\n')}\n检查项：\n${card.checks.map((item) => `- ${item}`).join('\n')}\n使用方式：${card.promptInstruction}`).join('\n\n') || '暂无已配置方法论卡片。请明确说明缺少框架文章，只能基于财务数据和通用框架判断。'}

研报模板规则：
${formatStockReportTemplateForPrompt(reportTemplate)}

同业横评数据（来自本地已持久化三表；缺数据时必须明说，不要编造）：
${peerComparisonText}

相关文章引用（用于溯源，不要机械复述）：
${articles.map((article) => `- ${article.title}（ID: ${article.articleId}，日期：${article.publishDate ?? '未知'}，原因：${article.reason ?? '未填写'}，摘要：${article.excerpt}`).join('\n') || '- 暂无相关文章引用'}

请从以下角度输出分析：

1. 一句话结论：买入 / 持有 / 观察 / 回避 / 等待更好价格。必须优先使用百分比、倍数、覆盖率和同行位置，不要堆绝对金额。
2. 基础质量：按模板要求分析赚钱质量、经营霸权或银行资产质量；非金融公司必须包含 ROE 杜邦拆解。
3. 分红质量和可持续性：区分账面利润分红、自由现金流分红、资本约束分红。
4. 同业横评：只和模板中的细分行业同行比较。横评表后必须解释关键指标分别说明什么、容易在哪里误读。若同行三表数据缺失，必须明确写“当前 DB 缺少某某同行数据，不能给出严肃横评”，并列出需要补的数据。
5. PEG 专栏：必须单独成节，不要淹没在估值段里。解释 PE、盈利 CAGR、PEG、股息率、自由现金流覆盖和隐含长期回报之间的取舍；当历史分位低但 PEG 偏高时，要明确这是“相对过去便宜，但绝对回报要求仍高”。
6. 商誉检查：必须列出商誉、商誉/净资产、商誉/总资产；商誉较高时说明减值风险会如何影响利润和净资产。
7. 估值与安全边际：区分好公司和好价格，给出买入/加仓/持有/回避的条件。必须同时讨论历史 PE 分位、绝对 PE、盈利 CAGR、PEG 和股息率。
8. 需要查什么来印证什么：用表格列出判断、应查信息、支持信号、反驳信号，替代“结论置信度”。
9. 可能在哪里死掉：从业务、财务、估值、治理、行业结构多角度列出推翻结论的触发器。
10. 盛京剑客文章框架映射：用表格列出文章标题、核心观点、对本公司的启发、与财务数据是否一致、需要继续验证的地方。
11. 后续跟踪指标：优先列年报/中报核心指标；一季报只在出现异常触发信号时单独讨论。
12. 最终操作建议：已持有者、未持有者、分红复投策略、重新评估条件。

要求：
- 不要使用空泛形容词。
- 每个重要结论必须给出数据证据。
- 不要只看增长率，要看现金流和资产质量。
- 不要把高股息率自动等同于好投资。
- 不要输出“结论置信度”章节。
- 不要把一季报作为固定章节，除非它改变了核心趋势判断。
- 如果数据不足，请明确说“不足以判断”，不要编造。
- 投资建议仅作为研究辅助，不构成确定性买卖指令。`;

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockAiPromptReq;
    const symbol = normalizeSymbol(body.symbol ?? '');
    if (!symbol) throw new Error('symbol is required');

    await syncConfiguredArticles(uid, symbol);

    const portfolio = await buildStockPortfolio(uid);
    const summary = portfolio.symbolSummaries.find((item) => item.symbol === symbol);
    if (!summary) throw new Error('stock not found');

    const [fundamentals, dividendEvents, mappings] = await Promise.all([
      prisma.stockFundamental.findMany({
        where: { symbol },
        orderBy: [{ reportDate: 'desc' }],
        take: 8,
      }),
      prisma.stockDividendMarking.findMany({
        where: { userId: uid, countTowardNormalizedDividend: true, event: { symbol } },
        include: { event: true },
        orderBy: [{ event: { exDividendDate: 'desc' } }, { eventId: 'desc' }],
      }),
      prisma.stockFrameworkArticle.findMany({
        where: { userId: uid, symbol: { in: [GLOBAL_FRAMEWORK_SYMBOL, symbol] } },
        orderBy: [{ weight: 'desc' }, { id: 'asc' }],
      }),
    ]);

    const articles = await loadFrameworkArticles(mappings);
    const frameworkCards = loadFrameworkCards(articles);
    const metrics = buildMetrics(summary);
    const reportTemplate = getStockReportTemplate(symbol, summary.sector);
    const peerComparisonText = await buildPeerComparisonText(reportTemplate.peers);
    const prompt = buildPrompt({ summary, metrics, fundamentals, dividendEvents, articles, frameworkCards, reportTemplate, peerComparisonText });

    return success<IStockAiPromptRes>({
      symbol,
      name: summary.name,
      prompt,
      frameworkArticles: articles,
      frameworkCards,
      metrics,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return fail(error);
  }
}