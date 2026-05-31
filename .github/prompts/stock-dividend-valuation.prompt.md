---
description: "Use when: valuing a dividend-oriented stock with deducted profit, deducted PE percentiles, marked normal dividends, and financial-report anomaly checks."
name: "Stock Dividend Valuation"
argument-hint: "Stock symbol/name, optional normal dividend, optional valuation window"
agent: "agent"
---

Analyze the stock as a long-term, dividend-aware holding. Use the latest method as the default: value the company from sustainable deducted profit and historical deducted PE percentiles, then use the user-marked normal dividend to infer the dividend yield at each PE-derived price edge.

Use persisted local project data first. Prefer `StockFinancialStatement`, `StockFundamental`, `StockValuationSnapshot`, `StockDividendEvent`, user `StockDividendMarking`, `StockMetricOverride`, and `StockQuote`. Treat Tushare-backed local DB rows as the canonical data source unless the user explicitly asks to refresh or required rows are missing.

Do not rely on old generated AI reports as evidence. They may contain obsolete methods. If an existing report is useful, use it only as context and re-check every important claim against current DB rows and financial statements.

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
   - Do not use `K` to derive implied dividend yield. `K` belongs only to payout coverage analysis.
   - Present the main price matrix as `price / implied yield` when that is easier to read.

6. Check dividend coverage separately.
   - Compute annual normal dividend cash amount as `normal DPS * total shares`.
   - Deducted-profit coverage: `deducted net profit / normal dividend cash amount`.
   - Operating-cash-flow coverage: normalized operating cash flow divided by normal dividend cash amount.
   - Free-cash-flow coverage: free cash flow divided by normal dividend cash amount, but do not let a clearly one-off distorted year dominate the whole conclusion.
   - Use historical `K = annual deducted net profit / annual dividend cash amount` only as evidence of coverage quality, not as a valuation shortcut.

7. Investigate anomalies from financial reports.
   - When the ratios look odd, go back to the financial statements and, if needed, the official annual/interim report or announcements to find the reason.
   - Typical triggers: headline PE suddenly much lower than deducted PE, profit jumps without cash flow, dividend payout exceeds recurring earnings, large investment income, asset disposal, equity sale, impairment reversal, consolidation-scope change, tax disturbance, or share-count jump.
   - For example, Darentang's headline PE was disturbed by the sale of the Sino-American Tianjin SmithKline equity stake; the right response was to inspect the financial report, identify the one-off disposal gain, and switch the main valuation denominator to deducted profit.
   - Apply this habit to every stock: if a number contradicts the business story, do not force the model. Find the accounting or business event first, then decide whether to adjust the valuation base.

8. Optional PEG/mean-reversion check.
   - Use only after the PE price matrix is built.
   - Formula: `annualized return = (PE2 / PE1)^(1/n) * (1 + g) - 1`, where `PE1` is current deducted PE, `PE2` is a future deducted PE anchor, and `g` is the annualized growth or recovery rate of sustainable deducted profit.
   - Use this as a return sanity check, not as the main valuation table.

## Required Output

Write a concise method-first report. Do not dump raw data. The report should answer four questions only: what six PE anchors are used, why the five profit tiers are chosen, what price/yield matrix they imply, and how to read that matrix.

Use this structure:

```markdown
## Conclusion

One or two short paragraphs. State the current valuation area, whether the price is supported by already visible deducted profit or depends on recovery, and what the marked normal dividend implies at current/target prices.

## 1. Six Deducted PE Anchors

Show five historical deducted PE percentiles plus current deducted PE. Include snapshot window, frequency, sample count, and any company-specific reason to prefer deducted PE over headline PE. Keep the explanation short.

| PE anchor | PE | Meaning |
|---|---:|---|

## 2. Five Deducted Profit Tiers

Give exactly five deducted-profit tiers and clear reasons. This is the most company-specific part of the report; use financial statements and announcements to explain any unusual profit disturbance.

| Tier | Deducted profit | Basis | Evidence quality |
|---|---:|---|---|

## 3. Price And Implied Dividend Yield

Each cell should show `price / implied yield` when a marked normal dividend exists.

| Deducted profit | P10 | P25 | P50 | Current PE | P75 | P90 |
|---|---:|---:|---:|---:|---:|---:|

## 4. Reading The Table

Explain the table in plain decision language: what price range is supported by current visible profit, what range requires recovery, what range is expensive, and what later financial-report items should be watched. Include dividend coverage only if it changes the conclusion.
```

Rules:
- Do not invent missing data.
- Do not treat high dividend yield as automatically safe.
- Do not mix per-share and total-company units.
- Do not hide one-off accounting distortions inside a generic PE number.
- Do not reuse old report conclusions without recalculating from current DB data.
- Keep the report focused on the valuation method and decision implication.
