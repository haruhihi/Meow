---
name: stock-evidence-research
description: "Use when: researching Chinese stocks, generating stock AI reports, preparing evidence packs, reading official annual/interim/quarterly reports, checking financial statements, dividends, valuation, overseas expansion, capex, tariffs, cash use, or payout ratio."
argument-hint: "Stock symbol/name, user id, research question"
---

# Stock Evidence Research

Use this project skill before writing any stock research conclusion. It standardizes the shared evidence workflow used by valuation reports, overseas expansion research, dividend analysis, capital-allocation analysis, and financial-report anomaly checks.

## When to Use

- The user asks for a stock AI report, valuation, dividend analysis, overseas expansion review, or capital-allocation analysis.
- The task depends on financial statements, official annual/interim/quarterly reports, announcements, dividends, valuation snapshots, cash flow, capex, inventory, tariffs, country layout, or payout ratio.
- The task names a company or stock symbol and asks to analyze recent strategy, financial reports, production/sales, overseas layout, or cash use.

## Evidence Procedure

1. Resolve the stock symbol and evidence scope.
   - Use the stock symbol or company name supplied by the user. If only a company name is supplied, resolve the corresponding A-share symbol before preparing evidence.
   - Ask only if the required user id, symbol, or report scope is impossible to infer.
   - Prefer at least five annual reports when available; use a larger window when the business question started earlier.

2. Prepare the baseline evidence pack.
   - Run `npm run prepare:stock-ai-report-evidence -- --symbol <symbol> --user-id <id>` when a user id is known.
   - Use persisted local data first: `StockFinancialStatement`, `StockFundamental`, `StockDividendEvent`, `StockDividendMarking`, `StockMetricOverride`, `StockMetricCache`, `StockValuationSnapshot`, and `StockQuote`.
   - Treat Tushare-backed DB rows as the canonical numeric spine unless the user asks to refresh or required rows are missing.

3. Refresh source data only when justified.
   - Do not sync financial statements before every report.
   - If required source rows are missing/stale, or the user explicitly asks to refresh, run `npm run sync:stock-source-data -- --symbols <symbol> --replace-source --sleep 0`.
   - After a source refresh, use the refreshed DB rows and evidence pack for analysis.

4. Read official filings before conclusions.
   - Use annual reports, interim reports, quarterly reports, exchange announcements, project investment announcements, board resolutions, and investor-relations records when they materially support the conclusion.
   - Include the latest year-to-date official filings when the user asks about "今年以来", recent strategy, current valuation validity, cash use, or payout decisions.
   - Prefer official documents over media summaries.

5. Extend evidence dynamically.
   - If deducted profit, operating cash flow, inventory, receivables, contract liabilities, capex, construction in progress, overseas project status, tariff exposure, dividend coverage, or payout policy looks counterintuitive, fetch the specific official report or announcement that explains it.
   - If the issue is older than the initial evidence window, rerun evidence gathering with a larger annual-report count.
   - If official sources do not explain the issue, mark it as `未识别/待跟踪` or `证据不足/待跟踪` instead of guessing.

## Analysis Rules

- Separate evidence from judgment. Cite the statement line, filing note, announcement, or data table that supports each important claim.
- Reconcile management explanations with the income statement, balance sheet, and cash-flow statement.
- Do not invent missing data, substitute nearby accounting concepts, or smooth over contradictions.
- Do not use old generated AI reports as evidence unless every important claim is re-checked against current DB rows and official filings.
- Do not write final conclusions through scripts or templates. Evidence scripts may prepare facts; the final report must be LLM-written from evidence.
- Do not treat planned capacity as delivered output, marked normal dividends as historical TTM dividends, or high dividend yield as automatically safe.
- When evidence is insufficient for a requested conclusion, say so plainly and list the next official source to check.

## Useful Cross-Checks

- Cash conversion: compare operating cash flow, deducted net profit, inventory, receivables, prepayments, payables, and taxes.
- Capex and reinvestment: compare cash paid for fixed/intangible/long-term assets, construction in progress, fixed assets, announced projects, and actual production ramp.
- Dividend capacity: compare normal dividend cash amount with deducted profit, operating cash flow, free cash flow, cash balance, debt, and expansion commitments.
- Overseas expansion: compare country/project announcements with regional revenue, overseas revenue, capacity, output, sales volume, margin, receivables, and inventory.
- Tariff/trade risk: connect country layout, product flow, local production, import/export exposure, and official risk disclosures before judging materiality.