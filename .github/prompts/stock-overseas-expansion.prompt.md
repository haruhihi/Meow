---
description: "Use when: researching an A-share company's overseas expansion, latest-year financial reports, country layout, production/sales capacity, tariff exposure, cash use, capex, reinvestment, and low payout ratio."
name: "Stock Overseas Expansion Research"
argument-hint: "Stock symbol/name, optional user id, optional annual-count/report window"
agent: "agent"
---

Analyze the stock as a business-quality and capital-allocation research note. Write the final report in Chinese. Keep official Chinese financial-report wording in Chinese unless the user explicitly asks for translation.

Before writing conclusions, follow the project `stock-evidence-research` skill: start from persisted local project data and an evidence pack, then read official reports and announcements before writing conclusions. Do not generate a report from a script template. Do not reuse old AI report conclusions without re-checking every important claim against current data and official filings.

Use the company or stock symbol supplied by the user. When the user asks for this workflow, the default research question is: 拉取今年以来财报和官方报表，分析该公司近年海外扩张策略、方向、趋势，在哪些国家布局，产销如何，是否会受到关税影响，赚的钱主要用于原材料、建厂、再投资还是分红，为什么分红率低。

## Evidence Workflow

1. Prepare the baseline evidence pack first.
   - Run `npm run prepare:stock-ai-report-evidence -- --symbol <symbol> --user-id <id>` when a user id is known.
   - Prefer at least five annual reports when available. Use a larger `--annual-count` when overseas expansion or capex history started earlier than the baseline window.
   - Use persisted `StockFinancialStatement`, `StockFundamental`, `StockDividendEvent`, `StockDividendMarking`, `StockMetricCache`, `StockValuationSnapshot`, and `StockQuote` as the numeric spine.

2. Pull and read latest-year official filings before finalizing.
   - Include this year's quarterly reports, interim report, annual report if already published, and major overseas investment/project announcements.
   - If local rows are missing or stale, sync source data only when the user has asked to refresh or required rows are missing. Use the approved source workflow: `npm run sync:stock-source-data -- --symbols <symbol> --replace-source --sleep 0`, then use the refreshed evidence.
   - For expansion claims, prefer official annual/interim/quarterly reports, project investment announcements, board resolutions, exchange announcements, and company investor-relations records over media summaries.

3. Extend evidence dynamically.
   - If a country, plant, subsidiary, raw-material reserve, tariff impact, capex program, impairment, inventory jump, or cash-flow gap cannot be explained from the baseline pack, fetch the specific official report or announcement that explains it.
   - If official sources do not identify the driver, mark it as `未识别/待跟踪` instead of guessing.

## Required Analysis

Answer these questions with evidence, not generic industry commentary:

1. Overseas expansion strategy.
   - What is the strategic direction: local production for local markets, resource/raw-material access, tariff avoidance, logistics cost reduction, customer proximity, or global market share expansion?
   - How has the direction changed across recent years?
   - Which business lines are involved: yeast, yeast extracts, nutrition/health, animal nutrition, organic fertilizer, or others?

2. Country and regional layout.
   - List countries and regions with official evidence: production base, sales subsidiary, project under construction, planned capacity, or market/service network.
   - For each important country, identify what is produced or sold, the operating status, major customer/market orientation when disclosed, and the investment scale or capacity when disclosed.
   - Distinguish completed production, construction in progress, announced investment, sales office, and vague market coverage.

3. Production and sales trend.
   - Use disclosed capacity, output, sales volume, regional revenue, overseas revenue, gross margin, utilization, inventory, receivables, and contract liabilities when available.
   - Explain whether overseas growth is volume-driven, price/mix-driven, exchange-rate-driven, or consolidation/project-ramp-driven.
   - If production capacity is rising faster than sales or cash flow, inspect inventory and receivables before concluding that expansion is healthy.

4. Tariff and trade-risk exposure.
   - Identify which countries or products could be affected by tariffs, anti-dumping, sanctions, local-content rules, import/export controls, foreign-exchange controls, or geopolitical risk.
   - Explain whether local factories reduce tariff exposure or create new country-specific risks.
   - Do not claim tariff impact is material unless filings, revenue mix, product flow, or country exposure supports it. If evidence is insufficient, mark the tariff conclusion as `证据不足/待跟踪`.

5. Cash use and capital allocation.
   - Reconcile net profit and operating cash flow with cash paid for goods/services, inventory, receivables, prepayments, capex, construction in progress, long-term assets, acquisitions, debt repayment, interest, dividends, and buybacks.
   - Specifically answer: is cash mainly going to raw-material purchases/reserves, new plants, overseas projects, working capital, debt, or shareholder returns?
   - Compare at least five years when available, plus the latest year-to-date report.

6. Low payout ratio.
   - Explain payout ratio using recurring profit, operating cash flow, free cash flow, capex cycle, overseas expansion needs, leverage, cash balance, and management dividend policy.
   - Do not say low payout is good or bad by default. Judge whether retained earnings are earning acceptable returns or being absorbed by low-return expansion/working capital.
   - Separate dividend capacity from dividend willingness: capacity comes from recurring profit and cash flow; willingness comes from stated policy, historical payout, expansion commitments, and controlling-shareholder incentives.

## Cross-Checks

- Match management explanations against the three statements. If management says expansion or raw-material reserves consumed cash, the balance sheet and cash-flow statement should show it through inventory, prepayments, construction in progress, fixed assets, cash paid for goods, investment cash outflow, or debt.
- Compare overseas revenue growth with gross margin and receivables. Fast overseas growth with margin compression or receivable buildup needs a quality warning.
- Compare capex and construction in progress with announced plant projects and actual production ramp. Do not treat planned capacity as delivered output.
- Compare dividends with free cash flow after expansion capex. If free cash flow is persistently negative, explain why a low payout ratio may be a financing choice rather than simple conservatism.
- For raw-material-sensitive businesses, inspect inventory notes, price changes, purchase commitments, and impairment provisions. Do not infer raw-material hoarding from total inventory alone.

## Required Output Structure

```markdown
## 结论

用两三段中文回答：海外扩张是否是主线、今年以来财报是否支持这个方向、关税风险是否重要、现金主要花到哪里、低分红率的核心原因是什么。

## 1. 证据边界

说明使用了哪些年度报告、今年以来哪些季报/半年报、哪些投资公告或投资者关系记录。列出缺失或待跟踪证据。

## 2. 海外扩张路线图

| 国家/地区 | 布局类型 | 产品/业务 | 状态 | 产能/投资额 | 证据 |
|---|---|---|---|---:|---|

说明战略方向和近年变化。

## 3. 产销与经营质量

| 年份/期间 | 海外收入 | 区域/产品线变化 | 毛利率 | 存货/应收变化 | 经营质量判断 |
|---|---:|---|---:|---|---|

解释增长来自销量、价格、汇率、项目爬坡还是并表/一次性因素。

## 4. 关税与贸易风险

列出可能受影响的国家、产品流向和证据强度。证据不足时明确写 `证据不足/待跟踪`。

## 5. 钱去哪了

| 年份/期间 | 经营现金流 | 购货付现/存货 | 资本开支/在建工程 | 投资/并购 | 分红 | 判断 |
|---|---:|---:|---:|---:|---:|---|

用三张表的勾稽解释现金主要流向：原材料、营运资本、新厂、海外项目、再投资、偿债或分红。

## 6. 为什么分红率低

分别判断分红能力和分红意愿。说明低分红率是扩张期资金需求、自由现金流不足、债务/营运资本约束、管理层政策，还是资金使用效率问题。

## 7. 后续跟踪清单

列出必须跟踪的财报科目、公告、国家风险、产能爬坡和分红政策信号。
```

Rules:
- Do not invent missing data.
- Do not treat planned overseas capacity as actual production or sales.
- Do not infer tariff impact without country/product flow evidence.
- Do not explain low payout ratio only with slogans such as "公司处于扩张期"; reconcile it with free cash flow and capex.
- Do not ignore latest-year reports because five-year annual data looks stable.
- Do not mix company-wide cash flow with a single overseas project unless the source explicitly supports the link.