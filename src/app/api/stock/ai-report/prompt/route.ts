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
  metric('PB', formatNumber(summary.pb), '资产定价口径，中药品牌型公司不能只按 PB 判断便宜。'),
  metric('扣非 ROE TTM', formatPercent(summary.deductedRoeTtm), '需要用杜邦拆解判断来自净利率、周转率还是杠杆。'),
  metric('自由现金流分红覆盖', formatNumber(summary.fcfDividendCoverage), '自由现金流 / 你标记的常态分红，低于 1 需要重点解释。'),
  metric('经营现金流 / 扣非净利润', formatNumber(summary.operatingCashFlowToDeductedNetProfit), '用于判断利润是否变成现金；长期显著低于 1 是风险信号。'),
];

const buildPrompt = ({
  summary,
  metrics,
  fundamentals,
  dividendEvents,
  articles,
  frameworkCards,
}: {
  summary: IStockPortfolioSymbolSummary;
  metrics: IStockAiPromptMetric[];
  fundamentals: Awaited<ReturnType<typeof prisma.stockFundamental.findMany>>;
  dividendEvents: MarkedDividendEvent[];
  articles: IStockAiPromptArticle[];
  frameworkCards: IStockAiFrameworkCard[];
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

相关文章引用（用于溯源，不要机械复述）：
${articles.map((article) => `- ${article.title}（ID: ${article.articleId}，日期：${article.publishDate ?? '未知'}，原因：${article.reason ?? '未填写'}，摘要：${article.excerpt}`).join('\n') || '- 暂无相关文章引用'}

请从以下角度输出分析：

1. 一句话结论：买入 / 持有 / 观察 / 回避 / 等待更好价格，并说明核心原因。
2. 结论置信度：高 / 中 / 低，说明还缺哪些数据。
3. 是否赚到了真钱：重点看经营现金流、自由现金流、扣非净利润、应收、存货、一次性收益。
4. 分红质量和可持续性：重点看自由现金流覆盖、股息支付率、历史稳定性、债务和资本开支压力。
5. ROE 杜邦拆解：拆净利率、总资产周转率、权益乘数，判断 ROE 质量。
6. 中药专项分析：品牌、独家品种、品类、医保/集采、OTC/院内/电商渠道、销售费用率、药材成本、提价能力、应收和存货质量、产品梯队。
7. 资产负债表和治理风险：现金、有息负债、商誉、关联交易、资金占用、担保、资本开支。
8. 成长性与成熟期判断：如果不增长，是否仍适合收息型持有。
9. 估值与安全边际：区分好公司和好价格，给出买入/加仓/持有/回避的条件。
10. 盛京剑客文章框架映射：用表格列出文章标题、核心观点、对本公司的启发、与财务数据是否一致、需要继续验证的地方。
11. 关键风险清单和触发信号。
12. 后续每季/年报跟踪指标。
13. 最终操作建议：已持有者、未持有者、分红复投策略、重新评估条件。

要求：
- 不要使用空泛形容词。
- 每个重要结论必须给出数据证据。
- 不要只看增长率，要看现金流和资产质量。
- 不要把高股息率自动等同于好投资。
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
    const prompt = buildPrompt({ summary, metrics, fundamentals, dividendEvents, articles, frameworkCards });

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