---
description: "Use when: analyzing a dividend-oriented stock with normal dividend, payout coverage, deducted profit trend, normalized operating cash flow, and target price."
name: "Stock Dividend Valuation"
argument-hint: "Stock symbol/name and any chosen normal dividend or target yield"
agent: "agent"
---

Analyze the stock as a dividend-oriented long-term holding. Use persisted local project data first: `StockFinancialStatement`, `StockFundamental`, `StockDividendEvent`, user `StockDividendMarking`, `StockMetricOverride`, `StockQuote`, and existing `StockAiReport` records. Do not refresh/sync external vendor data unless the user explicitly asks or required rows are missing.

Data planning note:
- For historical PE/PB percentiles, prefer self-calculated local data over vendor headline ratios.
- Tushare weekly price plus matching `daily_basic` rows is sufficient for the first local PE/PB/dividend-yield percentile implementation. Store weekly close, market cap, total shares, float shares, PE/PB/dividend-yield fields, and source metadata locally before calculating percentiles.
- Use Tushare or another source for historical market cap/total shares when possible. Avoid using the current share count to calculate old market caps unless clearly labeled as approximate.
- Default the local A-share valuation history to the post-2015 crash period rather than all available history. Earlier data can be added for specific companies or long-cycle studies, but should not be required for the first PE/PB percentile implementation.
- For post-2015 A-share weekly valuation snapshots, expect roughly 3 million rows for the full market. Plan for a few GB of PostgreSQL storage after indexes; this is acceptable for local/dev use and is preferred over storing full daily valuation history in the first version.

Inputs to clarify or infer:
- Stock symbol and company name.
- User-selected normal dividend events, especially the recurring cash dividend per 10 shares.
- User target dividend yield, defaulting to 3% when the user accepts a 3% yield.
- Whether unusual one-off items, asset disposals, tax payments, or consolidation-scope changes distort recent profit or cash flow.

Core workflow:

1. Establish the dividend baseline.
   - Use only user-marked normal dividend events or an explicit `StockMetricOverride.normalizedDividend` as the normal dividend source.
   - Treat repeated annual dividends, such as two consecutive years with the same cash-per-10 amount, as evidence for a single-year normal dividend level. Do not add multiple years together unless the user explicitly asks for a multi-year total.
   - Compute annual dividend cash amount from `cashPerTen / 10 * shares`, and compute DPS from `cashPerTen / 10`.

2. Separate reported profit from recurring profit.
   - Use net profit only as context when it contains large non-recurring items.
   - Prefer deducted net profit for recurring earnings coverage.
   - Identify asset disposals, investment income spikes, fair-value changes, impairment, consolidation-scope changes, and tax disturbances that make reported profit or cash flow misleading.

3. Measure payout coverage with a three-layer test.
   - Deducted profit coverage: `deducted net profit / normal dividend cash amount`.
   - Normalized operating cash flow coverage: use multi-year operating cash flow or adjusted operating cash flow when a clear one-off tax/working-capital disturbance exists.
   - Free cash flow coverage: `free cash flow / normal dividend cash amount`; keep it as the strictest safety test, but do not let a clearly one-off distorted year dominate the whole valuation.
   - Calculate historical `K` from prior annual reports when dividend events and annual fundamentals are available: `K = annual deducted net profit / annual cash dividend amount`.
   - Use historical `K` as evidence, not as a mechanical rule. A company with several years of `K < 1` after a payout step-up may be relying on cash reserves, asset sales, or an aggressive payout policy rather than recurring earnings.
   - Compare historical deducted-profit coverage with operating-cash-flow and free-cash-flow coverage to identify whether low `K` is a true earnings problem or a cash-flow timing/one-off-tax problem.

4. Analyze visible recurring profit trend instead of anchoring on one year.
   - Pull at least 5 years of annual deducted net profit when available.
   - Compute multi-year CAGR for deducted net profit using the latest annual value and the earliest valid positive base year.
   - Also inspect the slope: compare the latest 3-year average, 5-year average, and most recent annual/TTM value.
   - If a year is distorted by asset disposals, business divestiture, scope changes, or unusual impairment, label it and avoid treating it as a clean base.
   - Estimate next-year deducted net profit with scenarios rather than a single mechanical forecast:
     - Bear: flat or mild decline from latest recurring profit.
     - Base: latest recurring profit plus visible normalized growth/CAGR, capped by business reality.
     - Bull: requires evidence such as recent quarterly acceleration, price/volume recovery, or margin repair.

5. Convert coverage into target price.
   - Primary dividend target price: `DPS / target dividend yield`.
   - This target price is valid only if recurring deducted profit coverage and normalized operating cash flow coverage are close to or above 1.
   - Define variables explicitly before calculating:
     - `N`: total shares.
     - `C`: expected sustainable deducted net profit.
     - `M`: required dividend yield.
     - `K`: required dividend coverage ratio, where `K = C / dividend cash amount`.
     - `R`: payout ratio, where `R = dividend cash amount / C = 1 / K`.
   - Default to `K = 1.1` for dividend-oriented valuation unless the user specifies otherwise. This requires sustainable deducted profit to be about 10% higher than the dividend cash amount, leaving a modest safety margin.
   - If using coverage ratio: `target price = C / (K * N * M)`.
   - If using payout ratio: `target price = C * R / (N * M)`.
   - Do not mix per-share and total-company units. `P * N * M` is total dividend cash implied by market cap and target yield, while `C / K` or `C * R` is total affordable dividend cash.
   - If coverage is below 1.1, discount the target price or mark it as conditional on profit/cash-flow recovery.
   - Use PE only as a cross-check, based on recurring deducted net profit, not non-recurring reported net profit.
   - Provide at least five valuation tiers from bear to bull, using visible deducted-profit trend, CAGR, and latest TTM as the basis for `C`.
   - Do not build profit scenarios by mechanically applying 80%/90%/100%/110%/120% to current TTM. Build recovery scenarios from evidence: latest annual deducted profit, current TTM, recent 3-year average, prior clean high point, and a conditional strong-recovery case that requires cash-flow confirmation.
   - Prefer sensitivity tables over coverage-ratio tables: keep `K = 1.1` fixed, then show target prices at required dividend yields such as 3%, 3.5%, 4%, 4.5%, 5%, 5.5%, and 6%.
    - Use PE as the primary valuation model when dividend-yield variables become too noisy. If ten-year PE percentile data is available, build five valuation tiers from historical market consensus:
       - Low: 10th percentile PE.
       - Conservative: 25th percentile PE.
       - Base: 50th percentile PE.
       - Optimistic: 75th percentile PE.
       - Expensive: 90th percentile PE.
    - Prefer ten-year PE percentiles over short windows when the stock has stable business continuity, because it captures bull/bear cycles after major market regimes such as the 2015 A-share crash. Do not use it mechanically when the company has had major business-model, asset, share-count, accounting, or one-off-profit changes.
   - Do not rely on opaque vendor headline PE when the valuation thesis is based on deducted net profit. Headline PE usually uses reported net profit or another opaque denominator, so it can be distorted by disposals, fair-value gains, or one-off losses.
    - Prefer self-calculated deducted PE percentiles when data is available:
       - Historical market cap = historical close price * contemporaneous total shares.
       - Historical deducted PE = historical market cap / latest available deducted net profit TTM at that date.
       - Avoid look-ahead bias: a financial statement can only be used after its announcement/publication date. If announcement dates are unavailable, label the result approximate and use conservative lag rules.
       - Winsorize or exclude invalid samples where deducted profit is negative, near zero, missing, or distorted by explicitly identified one-off accounting events.
   - For PE percentile valuation, use recurring deducted net profit or expected sustainable deducted net profit as `C`, not reported net profit distorted by disposals or fair-value gains. Formula: `target price = C * PE / N`.
   - When showing a PE price-space matrix, combine five recovery-based deducted-profit scenarios with five self-calculated deducted PE percentiles. The matrix should explain which profit scenarios are already visible and which are conditional on recovery, instead of treating every scenario as equally proven.
    - Cross-check PE-derived target prices with dividend coverage. A PE-based target can be reasonable but still unattractive for a dividend account if normal dividends are not covered by recurring profit or normalized operating cash flow.

7. Data quality and reconciliation.
   - Treat Tushare as the canonical persisted source for local fundamentals, financial statements, dividends, historical market cap, PE/PB, and dividend-yield snapshots.
   - When derived ratios look absurd, inspect Tushare field mappings, units, announcement dates, and historical share/market-cap fields before changing valuation logic. Known risk: total shares/share-capital fields can be misunderstood, causing absurd market cap or PE values.
   - Store enough provenance to explain every derived ratio: source, fetched time, statement date, announcement date if available, and whether the value is raw, adjusted, or approximated.

8. State the result in decision terms.
   - Give a current verified value based on already proven recurring profit.
   - Give a conditional target price if next-year deducted profit and normalized operating cash flow recover.
   - Explicitly name the evidence needed to upgrade or downgrade the target.
   - Distinguish between short-term dividend ability supported by cash reserves and long-term dividend sustainability supported by recurring operations.

Preferred output format:

```markdown
## Conclusion

One-paragraph verdict: whether the stock qualifies as a comfortable dividend holding now, and whether the target price is current or conditional.

## Dividend Baseline

- Normal dividend: ...
- Annual dividend cash amount: ...
- Target yield: ...
- Dividend-yield target price: ...

## Coverage

| Metric | Value | Coverage | Judgment |
|---|---:|---:|---|
| Deducted net profit | ... | ... | ... |
| Normalized operating cash flow | ... | ... | ... |
| Free cash flow | ... | ... | ... |

## Deducted Profit Trend

Show 5-year deducted net profit, CAGR, 3-year average, latest TTM, and next-year bear/base/bull recurring profit assumptions.

## Target Price

When ten-year PE percentile data is available, include this table first:

| Scenario | Recurring deducted profit | PE percentile | PE | Target price | Dividend coverage check | Status |
|---|---:|---:|---:|---:|---|---|

Then include the dividend-yield sensitivity table as a safety check:

| Scenario | Recurring deducted profit | K | 3% | 3.5% | 4% | 4.5% | 5% | 5.5% | 6% | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|

## Risks And Revision Triggers

List what would make the target too optimistic or too conservative.
```

When updating a saved report, append or replace a clearly named section instead of duplicating old conclusions.