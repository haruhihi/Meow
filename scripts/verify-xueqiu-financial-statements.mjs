#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { setAppDatabaseUrl } from './database-url.mjs';
import { PrismaClient } from '@prisma/client';

const STATEMENTS = [
  { name: 'income', title: '利润表', pageHash: 'GSLRB' },
  { name: 'balance', title: '资产负债表', pageHash: 'ZCFZB' },
  { name: 'cash_flow', title: '现金流量表', pageHash: 'XJLLB' },
];

const MAP_EXPORTS = {
  income: 'xueqiuIncomeFieldMap',
  balance: 'xueqiuBalanceFieldMap',
  cash_flow: 'xueqiuCashFlowFieldMap',
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = { symbol: '', limit: 5 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--symbol') {
      result.symbol = String(args[index + 1] ?? '').trim().toUpperCase();
      index += 1;
    } else if (arg === '--limit') {
      result.limit = Number(args[index + 1] ?? result.limit);
      index += 1;
    }
  }
  if (!result.symbol) throw new Error('Usage: node scripts/verify-xueqiu-financial-statements.mjs --symbol 603288 [--limit 5]');
  result.limit = Math.min(Math.max(result.limit || 5, 1), 8);
  return result;
};

const toXueqiuSymbol = (symbol) => (symbol.startsWith('6') ? `SH${symbol}` : `SZ${symbol}`);

const createXueqiuSession = async (xueqiuSymbol) => {
  const cookies = new Map();
  const response = await fetch(`https://xueqiu.com/snowman/S/${xueqiuSymbol}/detail#/ZYCWZB`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: `https://xueqiu.com/S/${xueqiuSymbol}` },
  });
  response.headers.getSetCookie?.().forEach((cookie) => {
    const [pair] = cookie.split(';');
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex > 0) cookies.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
  });
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
};

const fetchXueqiuStatement = async ({ statement, xueqiuSymbol, cookieHeader, limit }) => {
  const url = new URL(`https://stock.xueqiu.com/v5/stock/finance/cn/${statement}.json`);
  url.searchParams.set('symbol', xueqiuSymbol);
  url.searchParams.set('type', 'all');
  url.searchParams.set('is_detail', 'true');
  url.searchParams.set('count', String(limit));
  url.searchParams.set('timestamp', '');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: `https://xueqiu.com/S/${xueqiuSymbol}`,
      Cookie: cookieHeader,
    },
  });
  if (!response.ok) throw new Error(`${statement} http ${response.status}`);
  const payload = await response.json();
  if (payload.error_code && payload.error_code !== 0) {
    throw new Error(`${statement} xueqiu error ${payload.error_code}: ${payload.error_description ?? ''}`);
  }
  return payload.data?.list ?? [];
};

const extractArrayBlock = (source, exportName) => {
  const marker = `export const ${exportName}`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`field map export not found: ${exportName}`);
  const assignmentStart = source.indexOf('=', start);
  if (assignmentStart === -1) throw new Error(`field map assignment not found: ${exportName}`);
  const arrayStart = source.indexOf('[', assignmentStart);
  if (arrayStart === -1) throw new Error(`field map array not found: ${exportName}`);
  let depth = 0;
  for (let index = arrayStart; index < source.length; index += 1) {
    if (source[index] === '[') depth += 1;
    if (source[index] === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(arrayStart, index + 1);
    }
  }
  throw new Error(`field map array not closed: ${exportName}`);
};

const loadFieldMaps = () => {
  const source = readFileSync('src/config/xueqiu-financial-fields.ts', 'utf8');
  return Object.fromEntries(Object.entries(MAP_EXPORTS).map(([statement, exportName]) => {
    const block = extractArrayBlock(source, exportName);
    const items = [];
    const itemPattern = /\{\s*label:\s*'([^']+)'\s*,\s*field:\s*(?:'([^']+)'|null)(?:\s*,\s*note:\s*'([^']+)')?/g;
    let match;
    while ((match = itemPattern.exec(block))) {
      items.push({ label: match[1], field: match[2] ?? null, note: match[3] });
    }
    return [statement, items];
  }));
};

const dateFromMillis = (value) => {
  if (!value) return null;
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const valueOf = (value) => (Array.isArray(value) ? value[0] : value);
const yoyOf = (value) => (Array.isArray(value) && typeof value[1] === 'number' ? value[1] : null);

const isSameValue = (left, right) => {
  if (left == null && right == null) return true;
  if (typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) <= Math.max(1e-6, Math.abs(left) * 1e-12);
  }
  return left === right;
};

const compareRawField = ({ liveRow, dbFields, field }) => {
  const liveRaw = liveRow?.[field];
  const dbRaw = dbFields?.[field];
  return {
    liveValue: valueOf(liveRaw),
    dbValue: valueOf(dbRaw),
    liveYoy: yoyOf(liveRaw),
    dbYoy: yoyOf(dbRaw),
  };
};

const main = async () => {
  const { symbol, limit } = parseArgs();
  setAppDatabaseUrl();
  const prisma = new PrismaClient();
  const xueqiuSymbol = toXueqiuSymbol(symbol);
  const cookieHeader = await createXueqiuSession(xueqiuSymbol);
  if (!cookieHeader) throw new Error('missing xueqiu anonymous cookie');
  const fieldMaps = loadFieldMaps();
  const mismatches = [];
  const dbMissingRows = [];
  let checked = 0;
  let skippedNullFields = 0;

  try {
    console.log(`Verifying ${symbol} against Xueqiu pages:`);
    STATEMENTS.forEach((statement) => {
      console.log(`- ${statement.title}: https://xueqiu.com/snowman/S/${xueqiuSymbol}/detail#/${statement.pageHash}`);
    });

    for (const statement of STATEMENTS) {
      const liveRows = await fetchXueqiuStatement({ statement: statement.name, xueqiuSymbol, cookieHeader, limit });
      const liveDates = liveRows.map((row) => dateFromMillis(row.report_date)).filter(Boolean);
      const dbRows = await prisma.stockFinancialStatement.findMany({
        where: { symbol, statement: statement.name, reportDate: { in: liveDates } },
      });
      const dbByDate = new Map(dbRows.map((row) => [row.reportDate.toISOString().slice(0, 10), row]));

      for (const liveRow of liveRows) {
        const reportDate = dateFromMillis(liveRow.report_date);
        if (!reportDate) continue;
        const dateKey = reportDate.toISOString().slice(0, 10);
        const dbRow = dbByDate.get(dateKey);
        if (!dbRow) {
          dbMissingRows.push(`${statement.name} ${liveRow.report_name ?? dateKey}`);
          continue;
        }

        if (liveRow.report_name !== dbRow.reportName) {
          mismatches.push({ statement: statement.name, report: liveRow.report_name, label: '报告期', field: 'report_name', live: liveRow.report_name, db: dbRow.reportName });
        }

        for (const item of fieldMaps[statement.name]) {
          if (!item.field) {
            skippedNullFields += 1;
            continue;
          }
          checked += 1;
          const compared = compareRawField({ liveRow, dbFields: dbRow.fields, field: item.field });
          const valueOk = isSameValue(compared.liveValue, compared.dbValue);
          const yoyOk = isSameValue(compared.liveYoy, compared.dbYoy);
          if (!valueOk || !yoyOk) {
            mismatches.push({
              statement: statement.name,
              report: liveRow.report_name ?? dateKey,
              label: item.label,
              field: item.field,
              live: compared.liveValue,
              db: compared.dbValue,
              liveYoy: compared.liveYoy,
              dbYoy: compared.dbYoy,
            });
          }
        }
      }
    }

    console.log(JSON.stringify({ checked, skippedNullFields, dbMissingRows, mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 50) }, null, 2));
    process.exitCode = dbMissingRows.length === 0 && mismatches.length === 0 ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});