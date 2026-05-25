import { Prisma } from '@prisma/client';
import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import {
  IStockAiReportListReq,
  IStockAiReportListRes,
  IStockAiReportSourceLink,
  StockAiReportListItem,
} from '@dtos/meow';
import { normalizeSymbol } from '../../helpers';

const HUADONG_MEDICINE_REPORT = {
  slug: 'huadong-medicine-procurement-risk-20260525',
  symbol: '000963',
  title: '华东医药：成熟现金牛集采压力下的转型兑现观察',
  summary: '医药工业仍是利润核心，医美、GLP-1 与创新药提供中长期期权；第十二批国采预填报覆盖他克莫司、环孢素、吲哚布芬核心口服剂型，后续需要等待最终名单、收入占比和中标结果验证。',
  reportDate: new Date('2026-05-25T00:00:00.000Z'),
  sourceLinks: [
    {
      title: '华东医药 2025 年年度报告',
      url: 'https://money.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?stockid=000963&id=12170070',
    },
    {
      title: '第十二批国采预填报药品范围 PDF',
      url: 'https://www.smpaa.cn/gjsdcg/files/file19332.pdf',
    },
    {
      title: '澎湃新闻：第十二批药品集采开始信息预填报',
      url: 'https://m.thepaper.cn/newsDetail_forward_33181903',
    },
    {
      title: '摩熵医药：第十二批国采预填报启幕',
      url: 'https://www.pharnexcloud.com/zixun/sx_310608',
    },
  ],
  content: `## 核心结论

华东医药不是单纯的高股息红利股，而是一个现金流基础尚可、正在从成熟仿制药和医药商业向创新药、医美、GLP-1 与工业微生物转型的医药平台。公司长期需求逻辑并不弱，但第十二批国采预填报已经触及他克莫司、环孢素、吲哚布芬等关键成熟产品，短期投资判断必须先回答集采冲击能否被创新业务覆盖。

这家公司当前最大的矛盾是：老产品贡献稳定现金流，但面临集采压价；新业务方向空间大，但兑现节奏和利润率仍需要时间验证。因此它更适合按“转型兑现”来跟踪，而不是简单按“稳定红利医药”来估值。

## 业务底盘

2025 年公司实现营业收入 436.12 亿元，同比增长 4.07%；归母净利润 34.14 亿元，同比下降 2.78%；扣非净利润 33.11 亿元，同比下降 1.20%。整体增长不快，但现金流质量尚可，经营活动现金流净额 42.46 亿元，高于当期净利润。

公司业务由医药商业、医药工业、医美和工业微生物构成。医药商业收入规模最大，但毛利率较低，更多承担渠道和供应链底盘作用。医药工业才是利润核心，2025 年医药工业实现营业收入 147.84 亿元，同比增长 7.04%，实现归母净利润 33.55 亿元，同比增长 15.59%。制造业口径毛利率达到 76.97%，说明制药端仍是公司质量最高的资产。

## 医美逻辑

医美长期需求来自抗衰、颜值管理和轻医美复购，需求侧确实有人性基础，但需求确定不等于公司短期利润确定。2025 年医美板块合计收入 18.26 亿元，同比下降 21.50%；国内医美收入同比下降 28.60%，欣可丽中国收入同比下降 31.50%。这说明医美在消费复苏不及预期、渠道竞争加剧和产品同质化压力下，短期仍处于调整阶段。

积极的一面是，华东医药的医美矩阵在扩充。公司已覆盖再生类、玻尿酸、肉毒毒素、能量源设备、提拉线等方向；Ellansé 已进入近 500 家医美机构，重组 A 型肉毒毒素芮妥欣在 2026 年 3 月获批。医美可以作为中长期增长期权，但目前还不是抵消成熟药集采压力的主引擎。

## 慢病与 GLP-1

糖尿病、肥胖、慢性肾病和老龄化相关疾病具有较强长期需求基础。华东医药在糖尿病领域积累较深，商业化及在研产品超过 20 款，覆盖 α-糖苷酶抑制剂、DPP-4、SGLT-2、GLP-1、胰岛素及类似物等方向。

重点管线包括口服小分子 GLP-1 受体激动剂 HDM1002、GLP-1R/GIPR 双靶点长效多肽 HDM1005，以及司美格鲁肽注射液等。年报披露 HDM1002 体重管理适应症中国 III 期已完成入组，司美格鲁肽注射液糖尿病适应症上市申请已受理，体重管理适应症上市申请也已受理。

这部分是未来弹性所在，但 GLP-1 赛道竞争极其拥挤。真正决定价值的不是“有管线”，而是上市速度、疗效差异、成本控制、医保和商业化能力。

## 集采风险

第十二批国采目前处于预填报阶段，不是最终采购公告，但预填报范围已经覆盖华东医药需要重点关注的核心口服剂型：他克莫司缓释控释剂型 0.5mg、1mg、5mg；他克莫司口服常释剂型 0.5mg、1mg、5mg；环孢素口服常释剂型 10mg、25mg、50mg、100mg；吲哚布芬口服常释剂型 0.1g、0.2g。

这不是边角料风险。若最终名单和中标规则继续覆盖上述剂型，华东医药成熟产品的收入和利润都可能承压。市场讨论中有观点认为三类成熟产品合计收入可能超过 50 亿元，并可能带来十亿元级利润冲击；这个结论目前仍需要公司口径或可靠数据库验证，不能直接当作事实使用。

判断集采影响必须分清三个口径：全国终端销售额不等于华东医药确认收入；通用名进入名单不等于所有核心剂型全部被打穿；收入下降也不等于利润等比例下降，因为集采后销售费用和渠道结构也会变化。

## 需要继续跟踪的问题

第一，最终采购公告是否保留这几类药品，以及企业投标资质和报量规则如何确定。

第二，华东医药对应剂型在 2025 年的真实收入和利润贡献。尤其要区分医院终端销售额、出厂确认收入、含税收入和不同剂型收入。

第三，华东医药在他克莫司、环孢素、吲哚布芬上的中标情况和价格降幅。如果中标并保量，冲击和未中标会完全不同。

第四，吲哚布芬专利纠纷对竞争格局的影响。年报披露公司针对相关侵权企业的行政裁决和诉讼有积极进展，如果竞争对手参与资格受限，实际冲击可能低于普通仿制药。

第五，创新产品收入能否持续高增长。2025 年创新产品销售及代理服务收入合计 23.4 亿元，同比增长 64.2%。若 2026 年继续快速增长，能部分抵消成熟产品压力；若增长不及预期，公司估值就要重新按低增速医药平台审视。

## 结论

华东医药长期方向并不差，医药工业质量仍在，医美、GLP-1、创新药和工业微生物都提供了未来空间。但第十二批国采预填报把成熟现金牛的不确定性提前暴露出来，当前最重要的不是简单判断“跌多了便宜”，而是确认成熟产品的利润底盘会被削掉多少，以及创新业务能多快补上。

在最终集采名单、品种收入占比和中标价格明确前，更适合把它视为需要跟踪的转型医药股，而不是可以直接重仓的稳定分红资产。`,
};

const normalizeSourceLinks = (value: Prisma.JsonValue): IStockAiReportSourceLink[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const title = 'title' in item ? item.title : null;
      const url = 'url' in item ? item.url : null;
      if (typeof title !== 'string' || typeof url !== 'string') return null;
      return { title, url };
    })
    .filter((item): item is IStockAiReportSourceLink => item !== null);
};

const toListItem = (report: Awaited<ReturnType<typeof prisma.stockAiReport.findMany>>[number]): StockAiReportListItem => ({
  id: report.id,
  userId: report.userId,
  slug: report.slug,
  symbol: report.symbol,
  title: report.title,
  summary: report.summary,
  content: report.content,
  sourceLinks: normalizeSourceLinks(report.sourceLinks),
  reportDate: report.reportDate.toISOString(),
  createdAt: report.createdAt.toISOString(),
  updatedAt: report.updatedAt.toISOString(),
});

const ensureSeedReports = async (userId: number) => {
  await prisma.stockAiReport.upsert({
    where: { userId_slug: { userId, slug: HUADONG_MEDICINE_REPORT.slug } },
    create: {
      userId,
      ...HUADONG_MEDICINE_REPORT,
      sourceLinks: HUADONG_MEDICINE_REPORT.sourceLinks,
    },
    update: {
      symbol: HUADONG_MEDICINE_REPORT.symbol,
      title: HUADONG_MEDICINE_REPORT.title,
      summary: HUADONG_MEDICINE_REPORT.summary,
      content: HUADONG_MEDICINE_REPORT.content,
      sourceLinks: HUADONG_MEDICINE_REPORT.sourceLinks,
      reportDate: HUADONG_MEDICINE_REPORT.reportDate,
    },
  });
};

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    await ensureSeedReports(uid);

    const body = (await req.json().catch(() => ({}))) as IStockAiReportListReq;
    const symbol = body.symbol ? normalizeSymbol(body.symbol) : null;
    const reports = await prisma.stockAiReport.findMany({
      where: { userId: uid, ...(symbol ? { symbol } : {}) },
      orderBy: [{ reportDate: 'desc' }, { id: 'desc' }],
    });

    return success<IStockAiReportListRes>({ reports: reports.map(toListItem) });
  } catch (error) {
    return fail(error);
  }
}