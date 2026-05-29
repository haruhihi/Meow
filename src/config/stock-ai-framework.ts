export const GLOBAL_FRAMEWORK_SYMBOL = 'GLOBAL';

export interface StockFrameworkArticleConfigItem {
  articleId: string;
  reason?: string;
  tags?: string[];
  weight?: number;
}

export interface StockFrameworkArticleConfig {
  global: StockFrameworkArticleConfigItem[];
  bySymbol: Record<string, StockFrameworkArticleConfigItem[]>;
}

export const stockFrameworkArticleConfig: StockFrameworkArticleConfig = {
  global: [
    { articleId: '1178', reason: '通胀、现金流和上下游占款框架', tags: ['通胀', '现金流', '上下游占款'], weight: 190 },
    { articleId: '1334', reason: 'P=PE*E 的收益来源拆解', tags: ['估值', '收益来源'], weight: 180 },
    { articleId: '1335', reason: '低估、收益增长和组合分散框架', tags: ['低估', '组合'], weight: 170 },
    { articleId: '1315', reason: '组合、调仓和再平衡框架', tags: ['组合', '再平衡'], weight: 160 },
    { articleId: '1226', reason: '大涨后调整不足的一秒排除规则', tags: ['追高排除', '风险收益比'], weight: 150 },
    { articleId: '1344', reason: '必需消费、提价能力和两头占款', tags: ['必需消费', '提价能力'], weight: 140 },
    { articleId: '1353', reason: '品牌、配方、工艺和消费心智型科技', tags: ['品牌科技', '定价权'], weight: 130 },
    { articleId: '1349', reason: '产品矩阵、价格带和消费分层', tags: ['产品矩阵', '消费分层'], weight: 120 },
    { articleId: '1266', reason: '中药财报看核心利润，剥离公允价值噪音', tags: ['中药', '核心利润'], weight: 110 },
  ],
  bySymbol: {},
};