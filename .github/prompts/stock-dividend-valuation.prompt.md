---
description: "Use when: valuing a dividend-oriented stock with deducted profit, deducted PE percentiles, marked normal dividends, and financial-report anomaly checks."
name: "Stock Dividend Valuation"
argument-hint: "Stock symbol/name, optional normal dividend, optional valuation window"
agent: "agent"
---

Analyze the stock as a long-term, dividend-aware holding. Use the latest method as the default: value the company from sustainable deducted profit and historical deducted PE percentiles, then use the user-marked normal dividend to infer the dividend yield at each PE-derived price edge. Write the final report in Chinese. Keep official Chinese financial-report wording in Chinese unless the user explicitly asks for translation.

Use persisted local project data first. Prefer `StockFinancialStatement`, `StockFundamental`, `StockValuationSnapshot`, `StockDividendEvent`, user `StockDividendMarking`, `StockMetricOverride`, and `StockQuote`. Treat Tushare-backed local DB rows as the canonical data source unless the user explicitly asks to refresh or required rows are missing.

Do not rely on old generated AI reports as evidence. They may contain obsolete methods. If an existing report is useful, use it only as context and re-check every important claim against current DB rows and financial statements.

Do not stop at structured DB rows when the conclusion depends on cash conversion, inventory, capex, dividends, impairments, related transactions, or management explanations. Read the latest official annual/interim report and compare it with at least the prior two annual reports when available. Use the report notes to explain what the structured statement rows cannot show, such as inventory composition, raw-material reserves, aging/expiry risk, impairment provisions, purchase-price changes, management explanations for cash-flow changes, and auditor key audit matters.

## Core Method

1. Define the valuation denominator.
   - Use deducted net profit, deducted net profit TTM, or sustainable deducted net profit as the main earnings base.
   - Use reported net profit only as context when non-recurring gains/losses, disposals, fair-value changes, impairments, consolidation changes, or tax effects distort the headline PE.
   - If headline PE and deducted PE disagree sharply, explain why before valuing the stock.

2. Build the deducted profit evidence base.
   - Pull at least five years of annual deducted net profit when available; prefer ten years when the company has stable business continuity and the DB contains enough rows.
   - Include the latest TTM deducted profit.
   - Compute or describe: latest annual value, current TTM, three-year average, five-year average, five-year or ten-year CAGR when valid, and any clean prior high point.
   - Do not create scenarios by mechanically applying 80%/90%/100%/110%/120% to current TTM.
   - Provide exactly five deducted-profit tiers from bear to bull. Each tier must cite its basis, such as latest annual value, current TTM, recent average, prior clean high point, or a recovery case supported by quarterly trend or business evidence.

3. Build the deducted PE valuation base.
   - Prefer self-calculated historical deducted PE from `StockValuationSnapshot.deductedPe`.
   - Use weekly snapshots by default. Prefer ten years or post-2015 history when available; if only five years are available, say so.
   - Exclude or winsorize invalid samples where deducted profit is negative, near zero, missing, or known to be distorted by one-off items.
   - Calculate five historical PE percentiles: P10, P25, P50, P75, P90.
   - Also calculate the current deducted PE from current price, total shares, and current deducted profit TTM.
   - Present six PE anchors in total: P10, P25, P50, current deducted PE, P75, P90. If current PE is almost equal to a percentile, keep both and explain what that means.
   - Explain the meaning of the five historical PE tiers: historical low, conservative, median, optimistic, expensive.
   - Avoid opaque vendor headline PE when the thesis is based on deducted profit.

4. Convert deducted profit into price.
   - Use `target price = sustainable deducted profit C * deducted PE / total shares N`.
   - Combine the five deducted-profit tiers with the six PE anchors to form a price matrix.
   - Explain which profit tiers are already visible and which are conditional on recovery.
   - Interpret price areas in decision terms: safety area, reasonable area, conditional optimistic area, and expensive area.

5. Infer dividend yield from PE-derived prices.
   - Use only user-marked normal dividend events or `StockMetricOverride.normalizedDividend` as the normal dividend source.
   - Treat duplicate or repeated rows for the same annual dividend as one normal annual dividend level; do not sum duplicate rows.
   - Compute DPS from `cashPerTen / 10`.
   - For each important price edge, compute `implied dividend yield = normal DPS / PE-derived target price`.
   - Do not derive dividend yield from profit coverage ratios. Dividend yield must always come from DPS divided by price.
   - Present the main price matrix as `price / implied yield` when that is easier to read.

6. Check dividend coverage separately.
   - Compute annual normal dividend cash amount as `normal DPS * total shares`.
   - Deducted-profit coverage: `deducted net profit / normal dividend cash amount`.
   - Operating-cash-flow coverage: normalized operating cash flow divided by normal dividend cash amount.
   - Free-cash-flow coverage: free cash flow divided by normal dividend cash amount, but do not let a clearly one-off distorted year dominate the whole conclusion.
   - Use coverage ratios only as dividend-quality evidence. Never use them as valuation shortcuts or to back into price/yield.

7. Review recent official financial reports together.
   - Before finalizing the thesis, compare at least three years of annual reports when available, plus the latest interim/quarterly report if it changes TTM profit or cash flow.
   - Use structured DB rows for the numeric spine, then use official report text and notes for the business explanation.
   - If a financial result contradicts common business sense or the company's usual pattern, treat it as an investigation trigger even when the headline valuation looks attractive.
   - Always compare operating cash flow to deducted profit over several years. If the ratio deteriorates, explain whether the cash is going to inventory, receivables, payables, capex, taxes, investment activity, or dividends.
   - For inventory-heavy companies, inspect the official report's inventory notes rather than relying only on total inventory. Distinguish raw materials, work in process, finished goods, goods shipped but not delivered, turnover days, expiry/aging information, impairment provisions, and management's stated reason for changes.
   - Compare cash purchases with accounting operating cost. If cash paid for goods is much higher than operating cost, explain whether the difference is consistent with inventory growth or supplier prepayments.
   - When revenue, gross margin, deducted profit, operating cash flow, inventory, receivables, payables, capex, tax expense, investment income, impairments, dividends, debt, or consolidation scope changes sharply, reconcile the change across the income statement, balance sheet, and cash-flow statement before drawing the valuation conclusion.
   - Treat management explanations as evidence, not proof. Cross-check them against inventory composition, turnover, margins, cash conversion, impairment provisions, and subsequent quarters.
   - Add source links to official annual/interim reports or announcements when they materially support the conclusion.

8. Investigate anomalies from financial reports.
   - When the ratios look odd, a result is counterintuitive, or a large financial disturbance appears, go back to the three financial statements and official annual/interim reports or announcements to find the reason.
   - Typical triggers: headline PE suddenly much lower than deducted PE, profit jumps without cash flow, dividend payout exceeds recurring earnings, large investment income, asset disposal, equity sale, impairment reversal, consolidation-scope change, tax disturbance, share-count jump, inventory growth far above revenue/cost growth, or operating cash flow/deducted profit deterioration across multiple years.
   - The explanation must connect the accounting event to the affected statement lines. For example: profit jump -> investment income/non-recurring gain and tax; cash-flow deterioration -> inventory/receivables/prepayments/taxes/capex; margin jump -> price, product mix, cost, impairment, or inventory accounting; dividend stress -> recurring profit, operating cash flow, free cash flow, and cash balance.
   - If the official report and three statements do not explain the disturbance well enough, say that the issue is unresolved and treat it as a risk instead of smoothing it away.
   - For example, Darentang's headline PE was disturbed by the sale of the Sino-American Tianjin SmithKline equity stake; the right response was to inspect the financial report, identify the one-off disposal gain, and switch the main valuation denominator to deducted profit.
   - For example, Pien Tze Huang's 2025 deducted profit did not convert to operating cash flow because cash purchases and raw-material inventory reserves increased sharply; the right response was to inspect several annual reports and the 2025 inventory note before judging whether this is strategic raw-material reserve, operating deterioration, or a fraud signal.
   - Apply this habit to every stock: if a number contradicts the business story, do not force the model. Find the accounting or business event first, then decide whether to adjust the valuation base.

9. Optional PEG/mean-reversion check.
   - Use only after the PE price matrix is built.
   - Formula: `annualized return = (PE2 / PE1)^(1/n) * (1 + g) - 1`, where `PE1` is current deducted PE, `PE2` is a future deducted PE anchor, and `g` is the annualized growth or recovery rate of sustainable deducted profit.
   - Use this as a return sanity check, not as the main valuation table.

## Required Output

Write a concise Chinese method-first report. Do not dump raw data. The report should answer five questions only: what six PE anchors are used, why the five profit tiers are chosen, what price/yield matrix they imply, what recent financial-report evidence changes the judgment, and how to read that matrix.

Use this structure:

```markdown
## 结论

One or two short Chinese paragraphs. State the current valuation area, whether the price is supported by already visible deducted profit or depends on recovery, and what the marked normal dividend implies at current/target prices.

## 1. 六个扣非 PE 锚点

Show five historical deducted PE percentiles plus current deducted PE. Include snapshot window, frequency, sample count, and any company-specific reason to prefer deducted PE over headline PE. Keep the explanation short.

| PE 锚点 | PE | 含义 |
|---|---:|---|

## 2. 五档扣非净利润

Give exactly five deducted-profit tiers and clear reasons. This is the most company-specific part of the report; use financial statements and announcements to explain any unusual profit disturbance.

| 档位 | 扣非净利润 | 依据 | 证据质量 |
|---|---:|---|---|

## 3. 价格和反推股息率

Each cell should show `price / implied yield` when a marked normal dividend exists.

| 扣非净利润 | P10 | P25 | P50 | 当前 PE | P75 | P90 |
|---|---:|---:|---:|---:|---:|---:|

## 4. 怎么读这张表

Explain the table in plain decision language: what price range is supported by current visible profit, what range requires recovery, what range is expensive, and what later financial-report items should be watched. Include dividend coverage only if it changes the conclusion.

## 5. 财报交叉验证

Include this section when cash conversion, inventory, dividends, impairments, capex, counterintuitive results, large financial disturbances, unidentified items, or management explanations materially affect the conclusion. Compare multiple recent annual reports instead of only the latest period.

Start with a beginner-friendly checklist. List each important item one by one, including growth, decline, disturbance, counterintuitive result, and unidentified or not-yet-explained item. For each item, explain in plain Chinese:
- what changed;
- where it appears in the income statement, balance sheet, and/or cash-flow statement;
- whether the official report notes explain it;
- what it means for valuation, dividend safety, or future tracking.

Use simple accounting language. Explain terms when needed: for example, "应收账款增加" means revenue has not yet turned into cash; "合同负债下降" usually means less customer prepayment; "存货增加" means cash may be sitting in goods or raw materials; "经营现金流低于扣非净利润" means accounting profit has not fully become cash yet.

After the checklist, show only the decisive rows and state what the official report notes say. If a point cannot be identified or explained from the three statements and official notes, mark it as `未识别/待跟踪` instead of forcing an explanation.

Examples of useful compact tables:

| 年份 | 经营现金流 | 扣非净利润 | 经营现金流/扣非 | 主要解释 |
|---|---:|---:|---:|---|

| 年份 | 存货 | 存货/收入 | 周转天数 | 存货附注 |
|---|---:|---:|---:|---|
```

Rules:
- Do not invent missing data.
- Do not treat high dividend yield as automatically safe.
- Do not mix per-share and total-company units.
- Do not hide one-off accounting distortions inside a generic PE number.
- Do not leave counterintuitive results or large financial disturbances unexplained; reconcile them with the three statements and official report notes, or mark them as unresolved risks.
- Do not reuse old report conclusions without recalculating from current DB data.
- Do not use old payout-coverage formulas to value the stock or infer dividend yield.
- Keep the report focused on the valuation method and decision implication.
