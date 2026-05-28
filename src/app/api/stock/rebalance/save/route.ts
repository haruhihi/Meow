import { prisma } from '@libs/prisma';
import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockRebalanceSaveReq, IStockRebalanceSaveRes } from '@dtos/meow';
import { normalizeName, normalizeSymbol, readNonNegativeNumber, requireOwnedStockAccount, roundStockValue } from '../../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockRebalanceSaveReq;
    const cashAmount = roundStockValue(readNonNegativeNumber(body.cashAmount, 'cashAmount'));
    const holdingUpdates = body.holdingUpdates ?? [];
    const holdingDeletes = body.holdingDeletes ?? [];
    const holdingCreates = body.holdingCreates ?? [];
    const updateIds = holdingUpdates.map((holding) => holding.id);
    const deleteIds = holdingDeletes.map((holding) => holding.id);
    const touchedIds = [...new Set([...updateIds, ...deleteIds])];

    if (new Set(updateIds).size !== updateIds.length) throw new Error('duplicate holding update');
    if (new Set(deleteIds).size !== deleteIds.length) throw new Error('duplicate holding delete');
    if (updateIds.some((id) => deleteIds.includes(id))) throw new Error('holding cannot be updated and deleted together');

    const existingHoldings = touchedIds.length > 0
      ? await prisma.stockHolding.findMany({ where: { id: { in: touchedIds }, userId: uid } })
      : [];
    if (existingHoldings.length !== touchedIds.length) throw new Error('holding not found');

    const normalizedUpdates = holdingUpdates.map((holding) => ({
      id: holding.id,
      quantity: readNonNegativeNumber(holding.quantity, 'quantity'),
    }));
    const normalizedCreates = await Promise.all(holdingCreates.map(async (holding) => {
      await requireOwnedStockAccount(uid, holding.accountId);
      const symbol = normalizeSymbol(holding.symbol ?? '');
      const name = normalizeName(holding.name ?? '');
      const quantity = readNonNegativeNumber(holding.quantity, 'quantity');
      const currentPrice = readNonNegativeNumber(holding.currentPrice, 'currentPrice');
      if (!symbol) throw new Error('symbol is required');
      if (!name) throw new Error('name is required');
      if (quantity <= 0) throw new Error('quantity must be greater than 0');
      return {
        accountId: holding.accountId,
        symbol,
        name,
        quantity,
        currentPrice,
      };
    }));

    const result = await prisma.$transaction(async (tx) => {
      const updated = await Promise.all(normalizedUpdates.map((holding) =>
        tx.stockHolding.update({
          where: { id: holding.id },
          data: { quantity: holding.quantity },
        })
      ));

      const deleted = holdingDeletes.length > 0
        ? await tx.stockHolding.deleteMany({ where: { id: { in: deleteIds }, userId: uid } })
        : { count: 0 };

      const created = await Promise.all(normalizedCreates.map(async (holding) => {
        await tx.stockQuote.upsert({
          where: { userId_symbol: { userId: uid, symbol: holding.symbol } },
          create: {
            userId: uid,
            symbol: holding.symbol,
            name: holding.name,
            currentPrice: holding.currentPrice,
          },
          update: {
            name: holding.name,
            currentPrice: holding.currentPrice,
          },
        });

        return tx.stockHolding.create({
          data: {
            userId: uid,
            accountId: holding.accountId,
            symbol: holding.symbol,
            quantity: holding.quantity,
          },
        });
      }));

      const cash = await tx.stockCash.upsert({
        where: { userId: uid },
        create: { userId: uid, amount: cashAmount },
        update: { amount: cashAmount },
      });

      return {
        updated: updated.length,
        deleted: deleted.count,
        created: created.length,
        cashAmount: cash.amount,
      };
    });

    return success<IStockRebalanceSaveRes>(result);
  } catch (error) {
    return fail(error);
  }
}