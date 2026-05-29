# Agent Instructions

- Do not run `npm run build` by default. Prefer narrower checks such as `npm run lint`, `npm run p -- validate`, targeted type/diagnostic checks, or behavior-specific commands. Run `npm run build` only when explicitly requested or when a broad production-build validation is necessary before finishing a risky change.
- This dev container does not have `rg` installed. Use VS Code search tools or shell `grep` for text/diff searches instead of `rg`.
- When starting a development server, always stop the server and free the port before finishing the turn unless the user explicitly asks to keep it running.
- For mobile-facing pages, prefer components from the existing UI library over native/desktop-style controls, and design interactions for convenient touch use and browsing.
- Prefer reusing existing code, components, calculation utilities, validation helpers, and formatting functions before adding new ones. Avoid duplicated business logic or separate UI paths that can drift into inconsistent calculations, inputs, or persistence behavior.

## Stock financial analysis workflow

- Do not sync Xueqiu financial statements before every report. GitHub Actions already refreshes the data on schedule; default to the persisted DB data to avoid unnecessary Xueqiu traffic and IP risk.
- Only run a manual sync when the user explicitly asks to refresh, when required statements are missing/stale, or when investigating a suspected data issue. Use `node scripts/sync-stock-fundamentals.mjs --symbols <symbol> --statement-count 40 --sleep 1500` for a single stock, or a larger `--sleep` for batches.
- `StockFundamental` stores the compact metrics used by the stock page. `StockFinancialStatement` stores raw Xueqiu `income`, `balance`, and `cash_flow` rows keyed by `symbol + statement + reportDate`; prefer this raw table for report generation and field verification.
- Xueqiu field mappings live in `src/config/xueqiu-financial-fields.ts`. Do not rely on guessed labels; verify new fields against Xueqiu display values or `scripts/verify-xueqiu-financial-statements.mjs` before using them in analysis.
- To verify mapped data against live Xueqiu APIs, run `node scripts/verify-xueqiu-financial-statements.mjs --symbol <symbol> --limit 5` only when needed. A valid result should have `dbMissingRows: []` and `mismatchCount: 0`.
- Generate reports as Markdown and save them to `StockAiReport` with stable slugs using the local DB path; the app does not call an online LLM. Reports should appear on the global AI report page and in each stock's `洞察` page.
- Report generation should use: persisted three-statement data, current quote/market cap, user-marked dividend events, existing holdings, and framework cards from `src/config/stock-ai-framework-cards.ts`.
- For each analysis, separate evidence from judgment: cash conversion, free-cash-flow dividend coverage, balance sheet quality, channel/prepayment strength, valuation via `P = PE * E`, portfolio sizing/rebalancing, and conditions that would change the conclusion.
