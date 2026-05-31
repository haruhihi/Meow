#!/usr/bin/env node

import crypto from 'node:crypto';
import { setAppDatabaseUrl } from './database-url.mjs';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

const SOURCE = 'tushare';
const TUSHARE_API_URL = 'http://api.tushare.pro';
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
  let replaceSource = false;

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
    } else if (arg === '--replace-source') {
      replaceSource = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return { symbols: symbols.filter(Boolean), limit, dryRun, sleep: Math.max(0, sleep), replaceSource };
};

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

const fromTsCode = (tsCode) => String(tsCode ?? '').split('.')[0];

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

const normalizeTushareDate = (value) => {
  const text = String(value ?? '').trim();
  return /^\d{8}$/.test(text) ? text : null;
};

const dateFromTushare = (value) => {
  const text = normalizeTushareDate(value);
  if (!text) return null;
  return new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00.000Z`);
};

const reportPeriodFromEndDate = (value) => {
  const text = normalizeTushareDate(value);
  if (!text) return null;
  const year = text.slice(0, 4);
  const monthDay = text.slice(4);
  if (monthDay === '0331') return `${year}一季报`;
  if (monthDay === '0630') return `${year}中报`;
  if (monthDay === '0930') return `${year}三季报`;
  if (monthDay === '1231') return `${year}年报`;
  return text;
};

const numberOrNull = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const round = (value) => Math.round(value * 10000) / 10000;

const buildEventKey = (event) => {
  const digest = crypto.createHash('md5').update([
    event.symbol,
    event.reportPeriod ?? '',
    event.status ?? '',
    event.announcementDate?.toISOString().slice(0, 10) ?? '',
    event.recordDate?.toISOString().slice(0, 10) ?? '',
    event.exDividendDate?.toISOString().slice(0, 10) ?? '',
    event.cashPerTen ?? '',
    event.bonusSharesPerTen ?? '',
    event.transferSharesPerTen ?? '',
  ].join('|')).digest('hex').slice(0, 12);
  return `${SOURCE}:${event.symbol}:${event.reportPeriod ?? 'unknown'}:${digest}`;
};

const dividendEventDedupeKey = (event) => [
  event.symbol,
  event.reportPeriod ?? '',
  event.cashPerTen ?? 0,
  event.bonusSharesPerTen ?? 0,
  event.transferSharesPerTen ?? 0,
].join('|');

const dateKey = (value) => value?.toISOString().slice(0, 10) ?? '';

const dividendEventDateAmountKey = (event) => [
  event.symbol,
  dateKey(event.exDividendDate) || dateKey(event.recordDate) || dateKey(event.announcementDate),
  event.cashPerTen ?? 0,
  event.bonusSharesPerTen ?? 0,
  event.transferSharesPerTen ?? 0,
].join('|');

const parseDividendItem = (item) => {
  const symbol = fromTsCode(item.ts_code).toUpperCase();
  const reportPeriod = reportPeriodFromEndDate(item.end_date);
  const announcementDate = dateFromTushare(item.imp_ann_date ?? item.ann_date);
  const recordDate = dateFromTushare(item.record_date);
  const exDividendDate = dateFromTushare(item.ex_date);
  const paymentDate = dateFromTushare(item.pay_date);
  const status = String(item.div_proc ?? '').trim() || null;
  const cashPerShare = numberOrNull(item.cash_div_tax) ?? numberOrNull(item.cash_div);
  const bonusPerShare = numberOrNull(item.stk_bo_rate) ?? numberOrNull(item.stk_div);
  const transferPerShare = numberOrNull(item.stk_co_rate);
  const cashPerTen = cashPerShare != null && cashPerShare > 0 ? round(cashPerShare * 10) : null;
  const bonusSharesPerTen = bonusPerShare != null && bonusPerShare > 0 ? round(bonusPerShare * 10) : null;
  const transferSharesPerTen = transferPerShare != null && transferPerShare > 0 ? round(transferPerShare * 10) : null;
  if (cashPerTen == null && bonusSharesPerTen == null && transferSharesPerTen == null) return null;

  const descriptionParts = [];
  if (cashPerTen != null) descriptionParts.push(`10派${cashPerTen}`);
  if (bonusSharesPerTen != null) descriptionParts.push(`10送${bonusSharesPerTen}`);
  if (transferSharesPerTen != null) descriptionParts.push(`10转${transferSharesPerTen}`);
  const description = `${reportPeriod ?? item.end_date ?? ''} ${descriptionParts.join(' ')}${status ? `（${status}）` : ''}`.trim();
  const event = {
    eventKey: '',
    symbol,
    reportPeriod,
    announcementDate,
    recordDate,
    exDividendDate,
    paymentDate,
    cashPerTen,
    bonusSharesPerTen,
    transferSharesPerTen,
    dividendBaseShares: null,
    status,
    description,
    source: SOURCE,
  };
  event.eventKey = buildEventKey(event);
  return event;
};

const fetchDividendEvents = async (symbol) => {
  const rows = await fetchTushare('dividend', { ts_code: toTsCode(symbol) }, ['ts_code', 'end_date', 'ann_date', 'div_proc', 'stk_div', 'stk_bo_rate', 'stk_co_rate', 'cash_div', 'cash_div_tax', 'record_date', 'ex_date', 'pay_date', 'div_listdate', 'imp_ann_date']);
  return rows.map(parseDividendItem).filter(Boolean);
};

const deleteNonTushareEvents = async (symbol) => {
  const result = await prisma.stockDividendEvent.deleteMany({ where: { symbol, source: { not: SOURCE } } });
  return result.count;
};

const preferImplementedEvent = (left, right) => {
  const leftImplemented = /实施/.test(left.status ?? left.description ?? '');
  const rightImplemented = /实施/.test(right.status ?? right.description ?? '');
  if (leftImplemented !== rightImplemented) return leftImplemented ? left : right;
  const leftDate = left.exDividendDate ?? left.recordDate ?? left.announcementDate ?? new Date(0);
  const rightDate = right.exDividendDate ?? right.recordDate ?? right.announcementDate ?? new Date(0);
  return leftDate.getTime() >= rightDate.getTime() ? left : right;
};

const migrateMarkingsToTushareEvents = async (symbol) => {
  const oldEvents = await prisma.stockDividendEvent.findMany({
    where: { symbol, source: { not: SOURCE }, markings: { some: {} } },
    include: { markings: true },
  });
  if (oldEvents.length === 0) return { moved: 0, skipped: 0 };

  const tushareEvents = await prisma.stockDividendEvent.findMany({ where: { symbol, source: SOURCE } });
  const targetByKey = new Map();
  const targetByDateAmountKey = new Map();
  for (const event of tushareEvents) {
    const key = dividendEventDedupeKey(event);
    const current = targetByKey.get(key);
    targetByKey.set(key, current ? preferImplementedEvent(current, event) : event);
    const dateAmountKey = dividendEventDateAmountKey(event);
    const currentByDate = targetByDateAmountKey.get(dateAmountKey);
    targetByDateAmountKey.set(dateAmountKey, currentByDate ? preferImplementedEvent(currentByDate, event) : event);
  }

  let moved = 0;
  let skipped = 0;
  for (const oldEvent of oldEvents) {
    const target = targetByKey.get(dividendEventDedupeKey(oldEvent)) ?? targetByDateAmountKey.get(dividendEventDateAmountKey(oldEvent));
    if (!target) {
      skipped += oldEvent.markings.length;
      continue;
    }
    for (const marking of oldEvent.markings) {
      const existing = await prisma.stockDividendMarking.findUnique({
        where: { userId_eventId: { userId: marking.userId, eventId: target.id } },
      });
      if (existing) {
        await prisma.stockDividendMarking.update({
          where: { id: existing.id },
          data: {
            countTowardNormalizedDividend: existing.countTowardNormalizedDividend || marking.countTowardNormalizedDividend,
            note: existing.note ?? marking.note,
          },
        });
      } else {
        await prisma.stockDividendMarking.create({
          data: {
            userId: marking.userId,
            eventId: target.id,
            countTowardNormalizedDividend: marking.countTowardNormalizedDividend,
            note: marking.note,
          },
        });
      }
      moved += 1;
    }
  }
  return { moved, skipped };
};

const upsertDividendEvent = async (event) => {
  await prisma.stockDividendEvent.upsert({
    where: { eventKey: event.eventKey },
    create: event,
    update: {
      announcementDate: event.announcementDate,
      reportPeriod: event.reportPeriod,
      recordDate: event.recordDate,
      exDividendDate: event.exDividendDate,
      paymentDate: event.paymentDate,
      cashPerTen: event.cashPerTen,
      bonusSharesPerTen: event.bonusSharesPerTen,
      transferSharesPerTen: event.transferSharesPerTen,
      dividendBaseShares: event.dividendBaseShares,
      status: event.status,
      description: event.description,
      source: event.source,
      fetchedAt: new Date(),
    },
  });
};

const main = async () => {
  const args = parseArgs();
  let symbols = await fetchSymbols(args.symbols);
  if (args.limit > 0) symbols = symbols.slice(0, args.limit);
  console.log(`syncing Tushare dividends for ${symbols.length} symbols: ${symbols.join(', ')}`);

  let ok = 0;
  let written = 0;
  const failed = [];
  for (const symbol of symbols) {
    try {
      const events = await fetchDividendEvents(symbol);
      if (events.length === 0) {
        failed.push(symbol);
        console.error(`[${symbol}] no Tushare dividend events`);
        continue;
      }
      for (const event of events) {
        console.log(`[${symbol}] period=${event.reportPeriod ?? 'N/A'} status=${event.status ?? 'N/A'} ex=${event.exDividendDate?.toISOString().slice(0, 10) ?? 'N/A'} announcement=${event.announcementDate?.toISOString().slice(0, 10) ?? 'N/A'} cash10=${event.cashPerTen} bonus10=${event.bonusSharesPerTen} transfer10=${event.transferSharesPerTen}`);
        if (!args.dryRun) await upsertDividendEvent(event);
        written += 1;
      }
      if (!args.dryRun && args.replaceSource) {
        const migrated = await migrateMarkingsToTushareEvents(symbol);
        const deleted = await deleteNonTushareEvents(symbol);
        console.log(`[${symbol}] migrated dividendMarkings=${migrated.moved} skipped=${migrated.skipped} deleted old non-Tushare dividendEvents=${deleted}`);
      }
      ok += 1;
    } catch (error) {
      if (isTushareTokenError(error)) throw error;
      failed.push(symbol);
      console.error(`[${symbol}] failed: ${error instanceof Error ? error.message : error}`);
    }
    if (args.sleep > 0) await sleepMs(args.sleep);
  }

  console.log(`done ok=${ok} written=${written} failed=${failed.length} failedSymbols=${failed.join(',')}`);
  return ok > 0 || failed.length === 0 ? 0 : 1;
};

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    if (isTushareTokenError(error)) {
      console.warn(`Skipping Tushare dividend sync: ${error.message}`);
      process.exit(0);
    }
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
