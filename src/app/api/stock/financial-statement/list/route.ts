import { Prisma } from '@prisma/client';
import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import {
  IStockFinancialStatementListReq,
  IStockFinancialStatementListRes,
  StockFinancialStatementMappedValue,
  StockFinancialStatementName,
} from '@dtos/meow';
import { normalizeSymbol, requireOwnedStockSymbol } from '../../helpers';
import { tushareFinancialFieldMaps } from '../../../../../config/tushare-financial-fields';

const STATEMENT_TITLES: Record<StockFinancialStatementName, string> = {
  income: '利润表',
  balance: '资产负债表',
  cash_flow: '现金流量表',
};

const STATEMENTS: StockFinancialStatementName[] = ['income', 'balance', 'cash_flow'];

const readFieldValue = (fields: Prisma.JsonValue, field: string | null): StockFinancialStatementMappedValue => {
  if (!field || !fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return { value: null, yoy: null };
  }

  const raw = (fields as Record<string, Prisma.JsonValue>)[field];
  if (Array.isArray(raw)) {
    const value = typeof raw[0] === 'number' || typeof raw[0] === 'string' ? raw[0] : null;
    const yoy = typeof raw[1] === 'number' ? raw[1] : null;
    return { value, yoy };
  }

  return { value: typeof raw === 'number' || typeof raw === 'string' ? raw : null, yoy: null };
};

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockFinancialStatementListReq;
    const symbol = normalizeSymbol(body.symbol ?? '');
    if (!symbol) throw new Error('symbol is required');
    const quote = await requireOwnedStockSymbol(uid, symbol);
    const limit = Math.min(Math.max(body.limit ?? 5, 1), 8);

    const latestPeriods = await prisma.stockFinancialStatement.findMany({
      where: { symbol },
      distinct: ['reportDate'],
      orderBy: { reportDate: 'desc' },
      take: limit,
      select: { reportDate: true, reportName: true },
    });
    const reportDates = latestPeriods.map((item) => item.reportDate);

    const statements = await prisma.stockFinancialStatement.findMany({
      where: { symbol, reportDate: { in: reportDates } },
      orderBy: [{ statement: 'asc' }, { reportDate: 'desc' }],
    });
    const byStatementDate = new Map(statements.map((item) => [`${item.statement}:${item.reportDate.toISOString()}`, item]));
    const periods = latestPeriods.map((item) => ({
      reportDate: item.reportDate.toISOString(),
      reportName: item.reportName ?? item.reportDate.toISOString().slice(0, 10),
    }));

    const sections = STATEMENTS.map((statement) => ({
      statement,
      title: STATEMENT_TITLES[statement],
      periods,
      rows: tushareFinancialFieldMaps[statement].map((mapItem) => ({
        label: mapItem.label,
        field: mapItem.field,
        note: mapItem.note,
        values: Object.fromEntries(periods.map((period) => {
          const row = byStatementDate.get(`${statement}:${period.reportDate}`);
          return [period.reportDate, readFieldValue(row?.fields ?? null, mapItem.field)];
        })),
      })),
    }));

    return success<IStockFinancialStatementListRes>({ symbol, name: quote.name, sections });
  } catch (error) {
    return fail(error);
  }
}