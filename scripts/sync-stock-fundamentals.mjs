#!/usr/bin/env node

import { setAppDatabaseUrl } from './database-url.mjs';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

const SOURCE = 'tushare';
const TUSHARE_API_URL = 'http://api.tushare.pro';
const DEFAULT_START_DATE = '20120101';
const STOCK_UNIVERSE_PATH = new URL('../src/config/stock-universe.json', import.meta.url);

class TushareTokenError extends Error {}

const isTushareTokenError = (error) => error instanceof TushareTokenError;

const isTushareTokenPayload = (payload) => {
  const message = String(payload?.msg ?? '').toLowerCase();
  return payload?.code === -2001 || /token|权限|过期|失效|无效|expired|invalid|unauthorized/.test(message);
};

setAppDatabaseUrl();

const prisma = new PrismaClient();

const parseArgs = () => {
  const args = process.argv.slice(2);
  const symbols = [];
  let limit = 0;
  let dryRun = false;
  let sleep = 300;
  let startDate = DEFAULT_START_DATE;
  let endDate = formatTushareDate(new Date());
  let replaceSource = false;
  let skipCurrent = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--symbols') {
      while (args[index + 1] && !args[index + 1].startsWith('--')) {
        symbols.push(args[index + 1].trim().toUpperCase());
        index += 1;
      }
    } else if (arg === '--limit') {
      limit = Number(args[index + 1] ?? 0);
      index += 1;
    } else if (arg === '--sleep') {
      sleep = Number(args[index + 1] ?? sleep);
      index += 1;
    } else if (arg === '--start-date') {
      startDate = normalizeTushareDate(args[index + 1] ?? startDate);
      index += 1;
    } else if (arg === '--end-date') {
      endDate = normalizeTushareDate(args[index + 1] ?? endDate);
      index += 1;
    } else if (arg === '--replace-source') {
      replaceSource = true;
    } else if (arg === '--skip-current') {
      skipCurrent = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return { symbols: symbols.filter(Boolean), limit, dryRun, sleep: Math.max(0, sleep), startDate, endDate, replaceSource, skipCurrent };
};

function normalizeTushareDate(value) {
  const text = String(value ?? '').trim().replaceAll('-', '');
  if (!/^\d{8}$/.test(text)) throw new Error(`invalid Tushare date: ${value}`);
  return text;
}

function formatTushareDate(date) {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadStockUniverseSymbols = () => {
  const text = readFileSync(STOCK_UNIVERSE_PATH, 'utf8');
  const items = JSON.parse(text);
  return Array.isArray(items)
    ? items.map((item) => String(item?.symbol ?? '').trim().toUpperCase()).filter(Boolean)
    : [];
};

const fetchSymbols = async (explicitSymbols) => {
  if (explicitSymbols.length > 0) return [...new Set(explicitSymbols)].sort();
  const rows = await prisma.stockHolding.findMany({
    distinct: ['symbol'],
    select: { symbol: true },
    orderBy: { symbol: 'asc' },
  });
  return [...new Set([...rows.map((row) => row.symbol), ...loadStockUniverseSymbols()])].sort();
};

const toTsCode = (symbol) => {
  const text = String(symbol ?? '').trim().toUpperCase();
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(text)) return text;
  if (!/^\d{6}$/.test(text)) throw new Error(`invalid A-share symbol: ${symbol}`);
  if (text.startsWith('6')) return `${text}.SH`;
  if (text.startsWith('0') || text.startsWith('2') || text.startsWith('3')) return `${text}.SZ`;
  return `${text}.BJ`;
};

const fetchTushare = async (apiName, params, fields) => {
  const token = process.env.TUSHARE_TOKEN;
  if (!token) throw new TushareTokenError('TUSHARE_TOKEN is required');

  const response = await fetch(TUSHARE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_name: apiName, token, params, fields: fields.join(',') }),
  });
  if (!response.ok) throw new Error(`tushare http ${response.status}`);

  const payload = await response.json();
  if (payload.code !== 0) {
    const message = `tushare ${apiName} error ${payload.code}: ${payload.msg ?? ''}`;
    if (isTushareTokenPayload(payload)) throw new TushareTokenError(message);
    throw new Error(message);
  }

  const responseFields = payload.data?.fields ?? [];
  return (payload.data?.items ?? []).map((item) => Object.fromEntries(responseFields.map((field, index) => [field, item[index]])));
};

const latestLocalReportOf = (symbol) => prisma.stockFundamental.findFirst({
  where: { symbol, source: SOURCE },
  orderBy: { reportDate: 'desc' },
  select: { reportDate: true, reportName: true },
});

const fetchLatestRemoteReport = async (symbol, options, localReportDate) => {
  const params = {
    ts_code: toTsCode(symbol),
    start_date: formatTushareDate(localReportDate),
    end_date: options.endDate,
  };
  const rows = await fetchTushare('fina_indicator', params, ['ts_code', 'ann_date', 'end_date', 'update_flag']);
  const latest = dedupeByEndDate(rows).at(-1);
  if (!latest?.end_date) return null;
  return {
    endDate: normalizeTushareDate(latest.end_date),
    reportName: reportNameFromEndDate(latest.end_date),
  };
};

const shouldSkipCurrentFinancials = async (symbol, options) => {
  if (!options.skipCurrent) return false;

  const local = await latestLocalReportOf(symbol);
  if (!local) return false;

  const localEndDate = formatTushareDate(local.reportDate);
  const latestRemote = await fetchLatestRemoteReport(symbol, options, local.reportDate);
  if (!latestRemote || latestRemote.endDate <= localEndDate) {
    console.log(`[${symbol}] latest local=${localEndDate} ${local.reportName ?? reportNameFromEndDate(localEndDate)} remote=${latestRemote?.endDate ?? 'none'} ${latestRemote?.reportName ?? ''}; skipped current financial statement fetch`);
    return true;
  }

  console.log(`[${symbol}] new report detected local=${localEndDate} remote=${latestRemote.endDate} ${latestRemote.reportName}; fetching financial statements`);
  return false;
};

const dateFromTushare = (value) => {
  const text = normalizeTushareDate(value);
  return new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00.000Z`);
};

const numberOrNull = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeJsonValue = (value) => JSON.parse(JSON.stringify(value));

const reportNameFromEndDate = (endDate) => {
  const text = normalizeTushareDate(endDate);
  const year = text.slice(0, 4);
  const monthDay = text.slice(4);
  if (monthDay === '0331') return `${year}一季报`;
  if (monthDay === '0630') return `${year}中报`;
  if (monthDay === '0930') return `${year}三季报`;
  if (monthDay === '1231') return `${year}年报`;
  return text;
};

const dedupeByEndDate = (rows) => {
  const map = new Map();
  for (const row of rows) {
    if (!row.end_date) continue;
    const existing = map.get(row.end_date);
    if (!existing || shouldPreferTushareRow(row, existing)) map.set(row.end_date, row);
  }
  return [...map.values()].sort((left, right) => String(left.end_date).localeCompare(String(right.end_date)));
};

const shouldPreferTushareRow = (row, existing) => {
  const rowUpdated = String(row.update_flag ?? '') === '1' ? 1 : 0;
  const existingUpdated = String(existing.update_flag ?? '') === '1' ? 1 : 0;
  if (rowUpdated !== existingUpdated) return rowUpdated > existingUpdated;

  const rowDate = String(row.f_ann_date ?? row.ann_date ?? '');
  const existingDate = String(existing.f_ann_date ?? existing.ann_date ?? '');
  if (rowDate !== existingDate) return rowDate > existingDate;

  return meaningfulValueCount(row) > meaningfulValueCount(existing);
};

const meaningfulValueCount = (row) => Object.entries(row)
  .filter(([key, value]) => key !== 'ts_code' && key !== 'end_date' && value != null && value !== '')
  .length;

const withAliases = (row, aliases) => {
  const normalized = { ...row };
  for (const [alias, source] of Object.entries(aliases)) {
    if (normalized[alias] == null && source != null) normalized[alias] = row[source] ?? null;
  }
  normalized.report_name = normalized.report_name ?? reportNameFromEndDate(row.end_date);
  normalized.report_date = normalized.report_date ?? row.end_date;
  return normalizeJsonValue(normalized);
};

const incomeAliases = {
  operating_costs: 'total_cogs',
  operating_cost: 'oper_cost',
  operating_taxes_and_surcharge: 'biz_tax_surchg',
  sales_fee: 'sell_exp',
  manage_fee: 'admin_exp',
  rad_cost: 'rd_exp',
  financing_expenses: 'fin_exp',
  finance_cost_interest_fee: 'fin_exp_int_exp',
  finance_cost_interest_income: 'fin_exp_int_inc',
  asset_impairment_loss: 'assets_impair_loss',
  income_from_chg_in_fv: 'fv_value_chg_gain',
  op: 'operate_profit',
  non_operating_income: 'non_oper_income',
  non_operating_payout: 'non_oper_exp',
  profit_total_amt: 'total_profit',
  income_tax_expenses: 'income_tax',
  net_profit: 'n_income',
  continous_operating_np: 'continued_net_profit',
  net_profit_atsopc: 'n_income_attr_p',
  minority_gal: 'minority_gain',
  dlt_earnings_per_share: 'diluted_eps',
  othr_compre_income: 'oth_compr_income',
  total_compre_income: 't_compr_income',
  total_compre_income_atsopc: 'compr_inc_attr_p',
  total_compre_income_atms: 'compr_inc_attr_m_s',
};

const balanceAliases = {
  currency_funds: 'money_cap',
  ar_and_br: 'accounts_receiv_bill',
  bills_receivable: 'notes_receiv',
  account_receivable: 'accounts_receiv',
  pre_payment: 'prepayment',
  interest_receivable: 'int_receiv',
  othr_receivables: 'oth_rcv_total',
  inventory: 'inventories',
  total_current_assets: 'total_cur_assets',
  invest_property: 'invest_real_estate',
  fixed_asset_sum: 'fix_assets_total',
  fixed_asset: 'fix_assets_total',
  construction_in_process_sum: 'cip_total',
  construction_in_process: 'cip',
  intangible_assets: 'intan_assets',
  lt_deferred_expense: 'lt_amor_exp',
  dt_assets: 'defer_tax_assets',
  othr_noncurrent_assets: 'oth_nca',
  total_noncurrent_assets: 'total_nca',
  st_loan: 'st_borr',
  bp_and_ap: 'payables',
  accounts_payable: 'accounts_pay',
  contract_liabilities: 'contract_liab',
  tax_payable: 'taxes_payable',
  dividend_payable: 'div_payable',
  othr_payables: 'oth_pay_total',
  total_current_liab: 'total_cur_liab',
  lt_loan: 'lt_borr',
  dt_liab: 'defer_tax_liab',
  noncurrent_liab_di: 'defer_inc_non_cur_liab',
  othr_non_current_liab: 'oth_ncl',
  total_noncurrent_liab: 'total_ncl',
  shares: 'total_share',
  capital_reserve: 'cap_rese',
  treasury_stock: 'treasury_share',
  othr_compre_income: 'oth_comp_income',
  earned_surplus: 'surplus_rese',
  undstrbtd_profit: 'undistr_porfit',
  total_quity_atsopc: 'total_hldr_eqy_exc_min_int',
  minority_equity: 'minority_int',
  total_holders_equity: 'total_hldr_eqy_inc_min_int',
  total_liab_and_holders_equity: 'total_liab_hldr_eqy',
};

const cashFlowAliases = {
  cash_received_of_sales_service: 'c_fr_sale_sg',
  refund_of_tax_and_levies: 'recp_tax_rends',
  cash_received_of_othr_oa: 'c_fr_oth_operate_a',
  sub_total_of_ci_from_oa: 'c_inf_fr_operate_a',
  goods_buy_and_service_cash_pay: 'c_paid_goods_s',
  cash_paid_to_employee_etc: 'c_paid_to_for_empl',
  payments_of_all_taxes: 'c_paid_for_taxes',
  othrcash_paid_relating_to_oa: 'oth_cash_pay_oper_act',
  sub_total_of_cos_from_oa: 'st_cash_out_act',
  ncf_from_oa: 'n_cashflow_act',
  cash_received_of_dspsl_invest: 'c_disp_withdrwl_invest',
  invest_income_cash_received: 'c_recp_return_invest',
  sub_total_of_ci_from_ia: 'stot_inflows_inv_act',
  cash_paid_for_assets: 'c_pay_acq_const_fiolta',
  invest_paid_cash: 'c_paid_invest',
  sub_total_of_cos_from_ia: 'stot_out_inv_act',
  ncf_from_ia: 'n_cashflow_inv_act',
  cash_received_of_borrowing: 'c_recp_borrow',
  sub_total_of_ci_from_fa: 'stot_cash_in_fnc_act',
  cash_pay_for_debt: 'c_prepay_amt_borr',
  cash_paid_of_distribution: 'c_pay_dist_dpcp_int_exp',
  othrcash_paid_relating_to_fa: 'oth_cashpay_ral_fnc_act',
  sub_total_of_cos_from_fa: 'stot_cashout_fnc_act',
  ncf_from_fa: 'n_cash_flows_fnc_act',
  effect_of_exchange_chg_on_cce: 'eff_fx_flu_cash',
  net_increase_in_cce: 'n_incr_cash_cash_equ',
  initial_balance_of_cce: 'c_cash_equ_beg_period',
  final_balance_of_cce: 'c_cash_equ_end_period',
};

const fetchFundamentals = async (symbol, options) => {
  const tsCode = toTsCode(symbol);
  const params = { ts_code: tsCode, start_date: options.startDate, end_date: options.endDate };
  const [incomeRows, balanceRows, cashFlowRows, indicatorRows] = await Promise.all([
    fetchTushare('income', params, ['ts_code', 'ann_date', 'f_ann_date', 'end_date', 'report_type', 'end_type', 'basic_eps', 'diluted_eps', 'total_revenue', 'revenue', 'total_cogs', 'oper_cost', 'biz_tax_surchg', 'sell_exp', 'admin_exp', 'fin_exp', 'assets_impair_loss', 'fv_value_chg_gain', 'invest_income', 'ass_invest_income', 'operate_profit', 'non_oper_income', 'non_oper_exp', 'total_profit', 'income_tax', 'n_income', 'n_income_attr_p', 'minority_gain', 'continued_net_profit', 'rd_exp', 'fin_exp_int_exp', 'fin_exp_int_inc', 'oth_compr_income', 't_compr_income', 'compr_inc_attr_p', 'compr_inc_attr_m_s', 'update_flag']),
    fetchTushare('balancesheet', params, ['ts_code', 'ann_date', 'f_ann_date', 'end_date', 'report_type', 'end_type', 'total_share', 'cap_rese', 'undistr_porfit', 'surplus_rese', 'money_cap', 'trad_asset', 'notes_receiv', 'accounts_receiv', 'prepayment', 'div_receiv', 'int_receiv', 'inventories', 'nca_within_1y', 'oth_cur_assets', 'total_cur_assets', 'lt_eqt_invest', 'oth_eqt_tools', 'invest_real_estate', 'fix_assets_total', 'cip_total', 'cip', 'intan_assets', 'r_and_d', 'goodwill', 'lt_amor_exp', 'defer_tax_assets', 'oth_nca', 'total_nca', 'total_assets', 'st_borr', 'acct_payable', 'accounts_pay', 'payables', 'payroll_payable', 'taxes_payable', 'int_payable', 'div_payable', 'oth_pay_total', 'non_cur_liab_due_1y', 'oth_cur_liab', 'total_cur_liab', 'lt_borr', 'defer_tax_liab', 'defer_inc_non_cur_liab', 'oth_ncl', 'total_ncl', 'total_liab', 'treasury_share', 'oth_comp_income', 'minority_int', 'total_hldr_eqy_exc_min_int', 'total_hldr_eqy_inc_min_int', 'total_liab_hldr_eqy', 'contract_liab', 'contract_assets', 'accounts_receiv_bill', 'update_flag']),
    fetchTushare('cashflow', params, ['ts_code', 'ann_date', 'f_ann_date', 'end_date', 'report_type', 'end_type', 'c_fr_sale_sg', 'recp_tax_rends', 'c_fr_oth_operate_a', 'c_inf_fr_operate_a', 'c_paid_goods_s', 'c_paid_to_for_empl', 'c_paid_for_taxes', 'oth_cash_pay_oper_act', 'st_cash_out_act', 'n_cashflow_act', 'c_disp_withdrwl_invest', 'c_recp_return_invest', 'n_recp_disp_fiolta', 'n_recp_disp_sobu', 'stot_inflows_inv_act', 'c_pay_acq_const_fiolta', 'c_paid_invest', 'n_disp_subs_oth_biz', 'stot_out_inv_act', 'n_cashflow_inv_act', 'c_recp_borrow', 'proc_issue_bonds', 'stot_cash_in_fnc_act', 'c_prepay_amt_borr', 'c_pay_dist_dpcp_int_exp', 'oth_cashpay_ral_fnc_act', 'stot_cashout_fnc_act', 'n_cash_flows_fnc_act', 'eff_fx_flu_cash', 'n_incr_cash_cash_equ', 'c_cash_equ_beg_period', 'c_cash_equ_end_period', 'free_cashflow', 'update_flag']),
    fetchTushare('fina_indicator', params, ['ts_code', 'ann_date', 'end_date', 'profit_dedt', 'bps', 'ocfps', 'fcff', 'fcfe', 'roe', 'roe_dt', 'update_flag']),
  ]);

  const income = dedupeByEndDate(incomeRows);
  const balance = dedupeByEndDate(balanceRows);
  const cashFlow = dedupeByEndDate(cashFlowRows);
  const indicators = dedupeByEndDate(indicatorRows);
  const incomeByDate = new Map(income.map((row) => [row.end_date, row]));
  const balanceByDate = new Map(balance.map((row) => [row.end_date, row]));
  const cashFlowByDate = new Map(cashFlow.map((row) => [row.end_date, row]));
  const indicatorByDate = new Map(indicators.map((row) => [row.end_date, row]));
  const dates = [...new Set([...incomeByDate.keys(), ...balanceByDate.keys(), ...cashFlowByDate.keys(), ...indicatorByDate.keys()])].sort();

  const fundamentals = dates.map((endDate) => {
    const incomeRow = incomeByDate.get(endDate);
    const balanceRow = balanceByDate.get(endDate);
    const cashFlowRow = cashFlowByDate.get(endDate);
    const indicator = indicatorByDate.get(endDate);
    return {
      symbol,
      reportDate: dateFromTushare(endDate),
      reportName: reportNameFromEndDate(endDate),
      totalShares: numberOrNull(balanceRow?.total_share),
      deductedNetProfit: numberOrNull(indicator?.profit_dedt),
      netProfit: numberOrNull(incomeRow?.n_income_attr_p) ?? numberOrNull(incomeRow?.n_income),
      revenue: numberOrNull(incomeRow?.revenue) ?? numberOrNull(incomeRow?.total_revenue),
      netAsset: numberOrNull(balanceRow?.total_hldr_eqy_exc_min_int) ?? numberOrNull(balanceRow?.total_hldr_eqy_inc_min_int),
      totalAssets: numberOrNull(balanceRow?.total_assets),
      operatingCashFlow: numberOrNull(cashFlowRow?.n_cashflow_act),
      capitalExpenditure: numberOrNull(cashFlowRow?.c_pay_acq_const_fiolta),
    };
  });

  const statements = [
    ...income.map((row) => ({ symbol, statement: 'income', reportDate: dateFromTushare(row.end_date), reportName: reportNameFromEndDate(row.end_date), fields: withAliases({ ...row, profit_dedt: indicatorByDate.get(row.end_date)?.profit_dedt ?? null, net_profit_after_nrgal_atsolc: indicatorByDate.get(row.end_date)?.profit_dedt ?? null }, incomeAliases) })),
    ...balance.map((row) => ({ symbol, statement: 'balance', reportDate: dateFromTushare(row.end_date), reportName: reportNameFromEndDate(row.end_date), fields: withAliases(row, balanceAliases) })),
    ...cashFlow.map((row) => ({ symbol, statement: 'cash_flow', reportDate: dateFromTushare(row.end_date), reportName: reportNameFromEndDate(row.end_date), fields: withAliases(row, cashFlowAliases) })),
  ];

  return { fundamentals, statements };
};

const deleteNonTushareFundamentals = async (symbol) => {
  const [statements, fundamentals] = await prisma.$transaction([
    prisma.stockFinancialStatement.deleteMany({ where: { symbol, source: { not: SOURCE } } }),
    prisma.stockFundamental.deleteMany({ where: { symbol, source: { not: SOURCE } } }),
  ]);
  return { statements: statements.count, fundamentals: fundamentals.count };
};

const upsertFundamental = async (item) => {
  await prisma.stockFundamental.upsert({
    where: { symbol_reportDate: { symbol: item.symbol, reportDate: item.reportDate } },
    create: { ...item, source: SOURCE },
    update: {
      reportName: item.reportName,
      totalShares: item.totalShares,
      deductedNetProfit: item.deductedNetProfit,
      netProfit: item.netProfit,
      revenue: item.revenue,
      netAsset: item.netAsset,
      totalAssets: item.totalAssets,
      operatingCashFlow: item.operatingCashFlow,
      capitalExpenditure: item.capitalExpenditure,
      source: SOURCE,
      fetchedAt: new Date(),
    },
  });
};

const upsertFinancialStatement = async (item) => {
  await prisma.stockFinancialStatement.upsert({
    where: { symbol_statement_reportDate: { symbol: item.symbol, statement: item.statement, reportDate: item.reportDate } },
    create: { ...item, source: SOURCE },
    update: { reportName: item.reportName, fields: item.fields, source: SOURCE, fetchedAt: new Date() },
  });
};

const main = async () => {
  const args = parseArgs();
  let symbols = await fetchSymbols(args.symbols);
  if (args.limit > 0) symbols = symbols.slice(0, args.limit);
  console.log(`syncing Tushare fundamentals for ${symbols.length} symbols: ${symbols.join(', ')}`);

  let ok = 0;
  let skippedCurrent = 0;
  let fundamentalsWritten = 0;
  let statementsWritten = 0;
  const failed = [];
  for (const symbol of symbols) {
    try {
      const skipped = await shouldSkipCurrentFinancials(symbol, args);
      if (skipped) {
        skippedCurrent += 1;
      } else {
        const { fundamentals, statements } = await fetchFundamentals(symbol, args);
        if (fundamentals.length === 0 && statements.length === 0) {
          failed.push(symbol);
          console.error(`[${symbol}] no Tushare fundamentals returned`);
          continue;
        }
        if (!args.dryRun && args.replaceSource) {
          const deleted = await deleteNonTushareFundamentals(symbol);
          console.log(`[${symbol}] deleted old non-Tushare fundamentals=${deleted.fundamentals} statements=${deleted.statements}`);
        }
        for (const item of fundamentals) {
          console.log(`[${symbol}] report=${item.reportDate.toISOString().slice(0, 10)} ${item.reportName} totalShares=${item.totalShares} deductedNetProfit=${item.deductedNetProfit} netAsset=${item.netAsset} operatingCashFlow=${item.operatingCashFlow}`);
          if (!args.dryRun) await upsertFundamental(item);
          fundamentalsWritten += 1;
        }
        for (const statement of statements) {
          if (!args.dryRun) await upsertFinancialStatement(statement);
          statementsWritten += 1;
        }
        console.log(`[${symbol}] financialStatements=${statements.length}`);
        ok += 1;
      }
    } catch (error) {
      if (isTushareTokenError(error)) throw error;
      failed.push(symbol);
      console.error(`[${symbol}] failed: ${error instanceof Error ? error.message : error}`);
    }
    if (args.sleep > 0) await sleepMs(args.sleep);
  }

  console.log(`done ok=${ok} skippedCurrent=${skippedCurrent} fundamentals=${fundamentalsWritten} financialStatements=${statementsWritten} failed=${failed.length} failedSymbols=${failed.join(',')}`);
  return ok > 0 || skippedCurrent > 0 || failed.length === 0 ? 0 : 1;
};

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    if (isTushareTokenError(error)) {
      console.warn(`Skipping Tushare fundamentals sync: ${error.message}`);
      process.exit(0);
    }
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
