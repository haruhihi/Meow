export interface StockReportPeer {
  symbol: string;
  name: string;
  role: string;
  listed?: boolean;
}

export interface StockReportVerificationItem {
  claim: string;
  evidence: string[];
  supportiveSignal: string;
  warningSignal: string;
}

export interface StockReportMetricExplanation {
  metric: string;
  meaning: string;
  watchFor: string;
}

export interface StockReportTemplate {
  id: string;
  name: string;
  scope: string;
  peers: StockReportPeer[];
  coreSections: string[];
  keyMetrics: string[];
  metricExplanations: StockReportMetricExplanation[];
  verificationItems: StockReportVerificationItem[];
  failureModes: string[];
  promptInstruction: string;
}

const baseManufacturingSections = [
  '一句话结论：优先使用百分比、倍数和横评位置，避免罗列收入、利润、现金流绝对值。',
  '赚钱质量：经营现金流/扣非净利润、销售收现/收入、自由现金流。',
  '经营霸权：应收/收入、合同负债/收入、合同负债/负债、应付/收入、存货/收入。',
  'ROE 杜邦拆解：净利率、资产周转率、权益乘数，并解释 ROE 变化来自哪里。',
  '分红质量：自由现金流覆盖常态分红、股息率、分红率和现金安全垫。',
  'PEG 专栏：单独讨论 PE、盈利 CAGR、PEG、股息率和隐含长期回报，不把 PEG 淹没在估值段里。',
  '商誉检查：列出商誉金额、商誉/净资产、商誉/总资产，并判断并购减值风险。',
  '估值赔率：用 P = PE * E 拆分盈利质量、增长、估值压缩和股息贡献；同时区分历史分位低估和绝对 PE/PEG 偏贵。',
  '同业横评：只和同一细分行业对标，缺同行数据时明确标注待补充。',
  '需要验证什么：把不确定性转成可查信息、支持信号和反驳信号。',
  '可能在哪里死掉：列出会推翻投资结论的业务、财务、估值和治理触发器。',
];

const manufacturingMetricExplanations: StockReportMetricExplanation[] = [
  {
    metric: '合同负债/总负债',
    meaning: '观察负债里有多少来自客户或经销商预付款。比例高通常说明负债质量更偏经营预收，而不是金融杠杆。',
    watchFor: '要结合后续收入兑现判断；如果合同负债高但收入不兑现，可能是压货或发货节奏问题。',
  },
  {
    metric: '合同负债/收入',
    meaning: '观察预收款相当于一年收入的比例，更直接反映渠道先打款能力。',
    watchFor: '连续下降且收入没有兑现，可能说明渠道信心或预收能力变弱。',
  },
  {
    metric: '应收/收入',
    meaning: '观察卖货后还有多少钱没收回来。越低通常说明收入不是靠赊销冲出来的。',
    watchFor: '快速上升通常意味着信用条件放松、渠道压力变大或客户付款能力变弱。',
  },
  {
    metric: '销售费用率',
    meaning: '观察公司为了卖货花了多少费用。成熟强品牌通常能用较低费用维持销售。',
    watchFor: '费用率高本身不一定坏，但如果收入、毛利率和 ROE 没同步改善，就可能是费用换增长。',
  },
  {
    metric: '存货/收入',
    meaning: '观察库存占一年收入的比例，用来判断周转、备货和潜在库存压力。',
    watchFor: '要区分工艺周期、战略备货和滞销；同业显著偏高时，需要查动销和减值风险。',
  },
  {
    metric: '销售收现/收入',
    meaning: '观察收入是否真正收到现金。大于 1 通常说明回款好，或存在预收。',
    watchFor: '单独大于 1 不足以说明最好，要和应收、合同负债、存货、费用率一起看组合质量。',
  },
  {
    metric: 'OCF/扣非',
    meaning: '观察扣非利润有没有转成经营现金流。长期大于 1 通常说明利润现金含量较好。',
    watchFor: '扣非为负或一次性营运资本变化较大时，倍数会失真，需要结合多年趋势。',
  },
  {
    metric: '扣非 ROE',
    meaning: '观察股东资本赚取主业利润的效率，比归母 ROE 更少受非经常性损益扰动。',
    watchFor: '必须拆净利率、资产周转率和权益乘数，避免把高杠杆撑出来的 ROE 当成高质量。',
  },
  {
    metric: '自由现金流/常态分红',
    meaning: '观察经营现金流扣掉资本开支后，能否覆盖常态现金分红。',
    watchFor: '低于 1 或长期贴近 1，说明收息安全垫偏薄，不能只看股息率。',
  },
  {
    metric: 'PEG',
    meaning: '用 PE 除以盈利增速，观察估值是否被增长支撑。它能把“历史低分位但绝对 PE 高”的矛盾摊开。',
    watchFor: '低增长成熟公司 PEG 往往很高，此时不能简单套成长股 PEG=1，而要结合股息率、现金流覆盖和可接受年化回报。',
  },
  {
    metric: '商誉/净资产',
    meaning: '观察并购形成的商誉相当于股东权益的比例，用来衡量未来减值对净资产和利润的潜在冲击。',
    watchFor: '比例高时要查商誉来源、被并购资产盈利承诺和经营表现；利润承压时商誉减值可能一次性吞噬利润。',
  },
];

export const stockReportTemplates: Record<string, StockReportTemplate> = {
  condiment: {
    id: 'condiment',
    name: '调味品现金牛模板',
    scope: '酱油、蚝油、复合调味品等高频低单价消费品。',
    peers: [
      { symbol: '603288', name: '海天味业', role: '龙头、渠道预收和现金牛基准。' },
      { symbol: '603027', name: '千禾味业', role: '零添加和高端化挑战者。' },
      { symbol: '600872', name: '中炬高新', role: '厨邦主体，治理和经营修复参照。' },
      { symbol: '002650', name: '加加食品', role: '弱势样本或风险参照，不一定每次纳入正文。' },
      { symbol: 'PRIVATE-LKK', name: '李锦记', role: '非上市调味品竞争者，重点做品牌、海外渠道、产品矩阵和高端化质性对比。', listed: false },
    ],
    coreSections: baseManufacturingSections,
    keyMetrics: [
      '合同负债/总负债',
      '合同负债/收入',
      '应收票据及应收账款/收入',
      '存货/收入',
      '应付票据及应付账款/收入',
      '销售收现/收入',
      '经营现金流/扣非净利润',
      '毛利率、扣非净利率、销售费用率',
      '扣非 ROE、资产周转率、权益乘数',
      '自由现金流/常态分红',
      '十年 PE 分位、五年归母净利润 CAGR、PEG',
      '商誉、商誉/净资产、商誉/总资产',
    ],
    metricExplanations: manufacturingMetricExplanations,
    verificationItems: [
      {
        claim: '渠道霸权仍在',
        evidence: ['合同负债/收入', '合同负债/总负债', '应收/收入', '经销商数量和单商收入'],
        supportiveSignal: '合同负债维持高位、应收很低、销售收现持续高于收入。',
        warningSignal: '合同负债连续下滑、应收抬头、收入增长依赖压货。',
      },
      {
        claim: '高端化和产品矩阵有效',
        evidence: ['分品类收入', '零添加/高端产品占比', '毛利率', '销售费用率'],
        supportiveSignal: '高端品类增速高于整体，毛利率稳定或改善。',
        warningSignal: '费用投入上升但毛利率不升，产品结构改善无法兑现到利润。',
      },
      {
        claim: '分红不是硬撑出来的',
        evidence: ['自由现金流/常态分红', '经营现金流/扣非净利润', '现金及金融资产', '资本开支计划'],
        supportiveSignal: '自由现金流持续覆盖分红，现金流质量不弱于利润。',
        warningSignal: '自由现金流连续无法覆盖分红，只靠存量现金维持派息。',
      },
      {
        claim: '低分位估值是否真的便宜',
        evidence: ['十年 PE 分位', '绝对 PE', '五年归母净利润 CAGR', 'PEG', '股息率', '合理增长中枢'],
        supportiveSignal: '历史分位低、绝对 PE 与成熟期增速匹配，且股息率和现金流覆盖提供回报底。',
        warningSignal: '历史分位低但绝对 PE 仍高，盈利 CAGR 很低导致 PEG 过高，长期回本主要依赖估值维持。',
      },
      {
        claim: '并购商誉是否有减值风险',
        evidence: ['商誉', '商誉/净资产', '商誉/总资产', '被并购资产利润贡献', '减值测试说明'],
        supportiveSignal: '商誉占比低，或被并购资产盈利稳定且现金流良好。',
        warningSignal: '商誉占净资产比例高，被并购业务利润下滑或现金流恶化。',
      },
    ],
    failureModes: [
      '渠道压货带来合同负债假强，随后收入和现金流回吐。',
      '零添加、高端化竞争削弱定价权，毛利率和净利率下移。',
      '餐饮端需求恢复弱，规模优势无法继续摊薄费用。',
      '自由现金流覆盖分红低于 1 后仍维持高分红，收息逻辑变脆。',
      '成熟期增长只有低个位数，但估值仍按高成长消费龙头定价。',
    ],
    promptInstruction: '按调味品现金牛分析：先证明渠道、回款和定价权，再讨论分红和估值。不要把海天和泛消费横向比较，优先与千禾味业、中炬高新/厨邦等同业比较；李锦记虽非上市公司，也要作为品牌、海外渠道和产品矩阵的质性竞争者纳入验证清单。估值上要同时讨论历史分位、绝对 PE、盈利 CAGR、PEG 和股息率，不能只用单一指标下结论。',
  },
  liquor: {
    id: 'liquor',
    name: '白酒品牌现金流模板',
    scope: '高端、次高端和区域白酒。',
    peers: [
      { symbol: '600519', name: '贵州茅台', role: '高端白酒定价权和渠道利润标杆。' },
      { symbol: '000858', name: '五粮液', role: '高端浓香龙头，批价和渠道库存参照。' },
      { symbol: '000568', name: '泸州老窖', role: '国窖和腰部产品结构参照。' },
      { symbol: '600809', name: '山西汾酒', role: '清香品类和全国化弹性参照。' },
    ],
    coreSections: baseManufacturingSections,
    keyMetrics: ['预收/合同负债', '批价和终端价', '毛利率', '销售费用率', '经营现金流/扣非净利润', '库存和渠道动销', '扣非 ROE', '分红率和股息率'],
    metricExplanations: manufacturingMetricExplanations,
    verificationItems: [
      {
        claim: '品牌定价权仍强',
        evidence: ['批价', '终端价', '合同负债', '毛利率'],
        supportiveSignal: '批价稳定、合同负债健康、毛利率不塌。',
        warningSignal: '批价倒挂、渠道库存升高、费用换增长。',
      },
    ],
    failureModes: ['渠道库存周期反噬收入。', '批价下行导致品牌势能受损。', '高估值遇到低增长形成 PE 和 E 双杀。'],
    promptInstruction: '按白酒品牌资产分析：重点看批价、渠道库存、预收、毛利率和分红，不要只看利润增速。',
  },
  tcm: {
    id: 'tcm',
    name: '中药品牌与核心利润模板',
    scope: '老字号中药、OTC、院内中成药和消费中药。',
    peers: [
      { symbol: '000423', name: '东阿阿胶', role: '名贵滋补和提价修复样本。' },
      { symbol: '000538', name: '云南白药', role: '品牌中药、日化和投资资产治理样本。' },
      { symbol: '000999', name: '华润三九', role: 'OTC 品牌矩阵和并购整合样本。' },
      { symbol: '600329', name: '达仁堂', role: '老字号和高分红中药参照。' },
    ],
    coreSections: [...baseManufacturingSections, '中药专项：独家品种、品牌、医保/集采、OTC/院内/电商渠道、药材成本和公允价值扰动。'],
    keyMetrics: ['核心利润率', '毛利率', '销售费用率', '扣非/归母差异', '应收/收入', '存货/收入', '经营现金流/扣非净利润', 'ROE 杜邦', '分红覆盖'],
    metricExplanations: manufacturingMetricExplanations,
    verificationItems: [
      {
        claim: '主营恢复而不是投资收益扰动',
        evidence: ['扣非净利润', '毛利率', '核心利润率', '公允价值变动收益'],
        supportiveSignal: '扣非和经营现金流同步改善。',
        warningSignal: '利润主要来自公允价值或处置收益。',
      },
    ],
    failureModes: ['集采或医保控费压低核心品种利润。', '销售费用驱动增长但现金流不匹配。', '投资资产波动吞噬主营利润判断。'],
    promptInstruction: '按中药模板分析：剥离公允价值噪音，重点看核心利润、品牌品种、渠道和药材成本。',
  },
  bank: {
    id: 'bank',
    name: '银行资产质量与资本约束模板',
    scope: '商业银行。',
    peers: [
      { symbol: '600036', name: '招商银行', role: '零售银行、财富管理和资产质量标杆。' },
      { symbol: '601288', name: '农业银行', role: '国有大行、高股息和低估值参照。' },
      { symbol: '601398', name: '工商银行', role: '国有大行资产负债表参照。' },
      { symbol: '601939', name: '建设银行', role: '国有大行 ROE 和分红参照。' },
    ],
    coreSections: [
      '一句话结论：用 PB、ROE、股息率、资产质量和资本充足率表达，不套用制造业现金流模板。',
      '赚钱能力：ROE、ROA、净息差、非息收入、成本收入比。',
      '资产质量：不良率、关注率、逾期率、拨备覆盖率、信用成本。',
      '负债优势：存款占比、活期存款占比、付息成本。',
      '资本约束：核心一级资本充足率、风险加权资产增速、分红率。',
      '估值赔率：用 PB、ROE、股息率和资产质量折价解释。',
      '需要验证什么：房地产、城投、零售贷款、财富管理和息差趋势。',
      '可能在哪里死掉：资产质量滞后暴露、息差继续收窄、资本不足压制分红。',
    ],
    keyMetrics: ['PB', 'ROE', 'ROA', '净息差', '不良率', '关注率', '拨备覆盖率', '核心一级资本充足率', '存款成本', '股息率和分红率'],
    metricExplanations: [
      {
        metric: 'PB 与 ROE',
        meaning: '银行估值核心是用 PB 匹配可持续 ROE，不能套制造业 PE/FCF 框架。',
        watchFor: '低 PB 可能是机会，也可能是在反映资产质量和 ROE 中枢下移。',
      },
      {
        metric: '净息差',
        meaning: '观察资产收益率和负债成本之间的利差，是银行盈利能力的核心。',
        watchFor: '净息差持续收窄会压低 ROE，除非资产质量、非息收入或成本控制能抵消。',
      },
      {
        metric: '不良率、关注率、逾期率',
        meaning: '观察贷款资产质量。关注和逾期往往比不良率更早暴露压力。',
        watchFor: '关注/逾期先升而不良率稳定时，要警惕风险滞后确认。',
      },
      {
        metric: '拨备覆盖率',
        meaning: '观察坏账准备对不良贷款的覆盖程度，是利润安全垫之一。',
        watchFor: '拨备高不等于没有风险，要看信用成本和真实不良生成。',
      },
      {
        metric: '核心一级资本充足率',
        meaning: '观察银行最核心资本是否足以支持资产扩张和分红。',
        watchFor: '资本吃紧时，增长和分红都会受约束。',
      },
    ],
    verificationItems: [
      {
        claim: '资产质量没有滞后暴雷',
        evidence: ['不良率', '关注率', '逾期率', '拨备覆盖率', '信用成本'],
        supportiveSignal: '关注率和逾期率不先于不良率恶化，拨备仍充足。',
        warningSignal: '关注/逾期先升，不良率稳定但拨备消耗。',
      },
      {
        claim: '分红受资本约束可持续',
        evidence: ['核心一级资本充足率', '风险加权资产增速', '分红率', '内生资本补充'],
        supportiveSignal: '资本充足率留有余地，利润留存足以支持增长和分红。',
        warningSignal: '资本吃紧、利润承压但仍高分红。',
      },
    ],
    failureModes: ['地产、城投或零售贷款风险集中暴露。', '净息差下行超过成本控制能力。', '财富管理和手续费收入持续萎缩。', '核心一级资本不足导致增长和分红同时受限。'],
    promptInstruction: '银行必须使用资产质量和资本约束模板，不分析自由现金流、合同负债或制造业经营现金流。招商银行要额外验证零售护城河、财富管理修复和地产风险出清。',
  },
  defaultConsumer: {
    id: 'defaultConsumer',
    name: '消费制造现金流模板',
    scope: '未配置专属模板的消费、制造和红利型非金融公司。',
    peers: [],
    coreSections: baseManufacturingSections,
    keyMetrics: ['经营现金流/扣非净利润', '销售收现/收入', '应收/收入', '存货/收入', '毛利率', '销售费用率', 'ROE 杜邦', '自由现金流/分红', '估值和股息率'],
    metricExplanations: manufacturingMetricExplanations,
    verificationItems: [
      {
        claim: '利润质量真实',
        evidence: ['经营现金流/扣非净利润', '销售收现/收入', '应收/收入'],
        supportiveSignal: '现金流长期不弱于利润，应收没有异常扩大。',
        warningSignal: '利润增长但现金流和回款同步变差。',
      },
    ],
    failureModes: ['利润现金含量下降。', 'ROE 靠杠杆或一次性因素维持。', '分红超过自由现金流承受力。', '估值和成熟期增长不匹配。'],
    promptInstruction: '使用通用非金融模板，并明确哪些细分行业数据缺失导致不能横评。',
  },
};

export const stockReportTemplateBySymbol: Record<string, string> = {
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

export const getStockReportTemplate = (symbol: string, sector?: string | null): StockReportTemplate => {
  const templateId = stockReportTemplateBySymbol[symbol];
  if (templateId && stockReportTemplates[templateId]) return stockReportTemplates[templateId];
  if (sector === '中药') return stockReportTemplates.tcm;
  return stockReportTemplates.defaultConsumer;
};

export const formatStockReportTemplateForPrompt = (template: StockReportTemplate) => [
  `模板：${template.name}`,
  `适用范围：${template.scope}`,
  `写作要求：${template.promptInstruction}`,
  `核心章节：\n${template.coreSections.map((item) => `- ${item}`).join('\n')}`,
  `关键指标：\n${template.keyMetrics.map((item) => `- ${item}`).join('\n')}`,
  `横评指标说明：\n${template.metricExplanations.map((item) => `- ${item.metric}：${item.meaning} 注意：${item.watchFor}`).join('\n')}`,
  `同行对标池：\n${template.peers.map((peer) => `- ${peer.symbol} ${peer.name}：${peer.role}${peer.listed === false ? '（非上市，仅做质性对比）' : ''}`).join('\n') || '- 暂无固定同行；如无同行数据，必须明确说明。'}`,
  `需要验证的信息：\n${template.verificationItems.map((item) => `- ${item.claim}：查 ${item.evidence.join('、')}；支持信号：${item.supportiveSignal}；反驳信号：${item.warningSignal}`).join('\n')}`,
  `可能在哪里死掉：\n${template.failureModes.map((item) => `- ${item}`).join('\n')}`,
].join('\n\n');