#!/usr/bin/env node

import { setAppDatabaseUrl } from './database-url.mjs';
import { PrismaClient } from '@prisma/client';

const SOURCE = 'tushare_index';
const PERIOD = 'WEEK';
const DEFAULT_START_DATE = '20150101';
const DEFAULT_INDICES = ['000001.SH'];
const TUSHARE_API_URL = 'http://api.tushare.pro';

class TushareTokenError extends Error {}

const isTushareTokenPayload = (payload) => {
  const message = String(payload?.msg ?? '').toLowerCase();
  return payload?.code === -2001 || /token|权限|过期|失效|无效|expired|invalid|unauthorized/.test(message);
};

setAppDatabaseUrl();

const prisma = new PrismaClient();

const parseArgs = () => {
  const args = process.argv.slice(2);
  const indices = [];
  let startDate = DEFAULT_START_DATE;
  let endDate = formatTushareDate(new Date());
  let sleep = 300;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--indices') {
      while (args[index + 1] && !args[index + 1].startsWith('--')) {
        indices.push(args[index + 1].trim().toUpperCase());
        index += 1;
      }
    } else if (arg === '--start-date') {
      startDate = normalizeTushareDate(args[index + 1] ?? startDate);
      index += 1;
    } else if (arg === '--end-date') {
      endDate = normalizeTushareDate(args[index + 1] ?? endDate);
      index += 1;
    } else if (arg === '--sleep') {
      sleep = Number(args[index + 1] ?? sleep);
      index += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return {
    indices: indices.length > 0 ? [...new Set(indices)].sort() : DEFAULT_INDICES,
    startDate,
    endDate,
    sleep: Number.isFinite(sleep) ? Math.max(0, sleep) : 300,
    dryRun,
  };
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

const dateFromTushare = (value) => {
  const text = normalizeTushareDate(value);
  return new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00.000Z`);
};

const numberOrNull = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchTushare = async (apiName, params, fields) => {
  const token = process.env.TUSHARE_TOKEN;
  if (!token) throw new TushareTokenError('TUSHARE_TOKEN is required');

  const response = await fetch(TUSHARE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_name: apiName,
      token,
      params,
      fields: fields.join(','),
    }),
  });
  if (!response.ok) throw new Error(`tushare http ${response.status}`);

  const payload = await response.json();
  if (payload.code !== 0) {
    const message = `tushare ${apiName} error ${payload.code}: ${payload.msg ?? ''}`;
    if (isTushareTokenPayload(payload)) throw new TushareTokenError(message);
    throw new Error(message);
  }

  const responseFields = payload.data?.fields ?? [];
  const items = payload.data?.items ?? [];
  return items.map((item) => Object.fromEntries(responseFields.map((field, index) => [field, item[index]])));
};

const fetchIndexWeeklyRows = (tsCode, startDate, endDate) => fetchTushare(
  'index_weekly',
  { ts_code: tsCode, start_date: startDate, end_date: endDate },
  ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'vol', 'amount'],
);

const buildSnapshots = (indexCode, rows) => rows
  .slice()
  .sort((left, right) => String(left.trade_date).localeCompare(String(right.trade_date)))
  .map((row) => ({
    symbol: indexCode,
    period: PERIOD,
    tradeDate: dateFromTushare(row.trade_date),
    close: numberOrNull(row.close),
    totalMarketCap: null,
    circulatingMarketCap: null,
    totalShares: null,
    floatShares: null,
    freeShares: null,
    pe: null,
    peTtm: null,
    pb: null,
    dividendYield: null,
    dividendYieldTtm: null,
    source: SOURCE,
  }))
  .filter((snapshot) => snapshot.close != null);

const upsertSnapshot = async (snapshot) => {
  await prisma.stockValuationSnapshot.upsert({
    where: {
      symbol_period_tradeDate: {
        symbol: snapshot.symbol,
        period: snapshot.period,
        tradeDate: snapshot.tradeDate,
      },
    },
    create: snapshot,
    update: {
      close: snapshot.close,
      source: snapshot.source,
      fetchedAt: new Date(),
    },
  });
};

const syncIndex = async (indexCode, args) => {
  const rows = await fetchIndexWeeklyRows(indexCode, args.startDate, args.endDate);
  const snapshots = buildSnapshots(indexCode, rows);
  if (!args.dryRun) {
    for (const snapshot of snapshots) await upsertSnapshot(snapshot);
  }
  return { rows: rows.length, snapshots: snapshots.length };
};

const main = async () => {
  const args = parseArgs();
  console.log(`syncing index snapshots period=${PERIOD} start=${args.startDate} end=${args.endDate} indices=${args.indices.join(',')}`);

  let written = 0;
  const failed = [];
  for (const indexCode of args.indices) {
    try {
      const result = await syncIndex(indexCode, args);
      written += result.snapshots;
      console.log(`[${indexCode}] indexWeekly=${result.rows} snapshots=${result.snapshots}`);
    } catch (error) {
      if (error instanceof TushareTokenError) throw error;
      failed.push(indexCode);
      console.error(`[${indexCode}] failed: ${error instanceof Error ? error.message : error}`);
    }
    if (args.sleep > 0) await sleepMs(args.sleep);
  }

  console.log(`done snapshots=${written} failed=${failed.length} failedIndices=${failed.join(',')}`);
  return failed.length === 0 ? 0 : 1;
};

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    if (error instanceof TushareTokenError) {
      console.warn(`Skipping Tushare index snapshot sync: ${error.message}`);
      process.exit(0);
    }
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });