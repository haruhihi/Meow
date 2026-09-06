#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { setAppDatabaseUrl } from './database-url.mjs';

setAppDatabaseUrl();

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();
const OLD_NAME = '缴费/日用/百货';
const NEW_NAME = '日用百货';
const PAYMENT_NAME = '缴费';
const PAYMENT_CHILDREN = ['话费', '水费', '电费', '燃气费', '物业费'];

class DryRunAbort extends Error {}
const money = (value) => Number((value ?? 0).toFixed(2));

const findUnique = (categories, name, parentId, label) => {
  const matches = categories.filter((category) => category.name === name && category.parentId === parentId);
  if (matches.length > 1) throw new Error(`ambiguous ${label}: ${name}`);
  return matches[0] ?? null;
};

const snapshot = async (client) => {
  const [categories, transactions] = await Promise.all([
    client.category.findMany({ orderBy: { id: 'asc' } }),
    client.transaction.findMany({ select: { categoryId: true, amount: true } }),
  ]);
  return {
    categories,
    transactionCount: transactions.length,
    transactionTotal: money(transactions.reduce((total, item) => total + item.amount, 0)),
  };
};

async function run() {
  const before = await snapshot(prisma);
  console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY RUN'} ===`);
  console.log(`Before: ${before.transactionCount} transactions, total ¥${before.transactionTotal.toFixed(2)}`);

  await prisma.$transaction(async (tx) => {
    const categories = [...before.categories];
    const oldCategory = findUnique(categories, OLD_NAME, null, 'old top category');
    const existingNew = findUnique(categories, NEW_NAME, null, 'new top category');
    if (existingNew && oldCategory && existingNew.id !== oldCategory.id) {
      throw new Error(`category already exists: ${NEW_NAME}`);
    }
    if (!oldCategory && !existingNew) throw new Error(`category not found: ${OLD_NAME}`);

    let dailyCategory = existingNew ?? oldCategory;
    if (!existingNew) {
      dailyCategory = await tx.category.update({ where: { id: oldCategory.id }, data: { name: NEW_NAME } });
      categories[categories.findIndex((category) => category.id === oldCategory.id)] = dailyCategory;
      console.log(`~ rename ${OLD_NAME} -> ${NEW_NAME} (id=${dailyCategory.id})`);
    } else {
      console.log(`· exists ${NEW_NAME} (id=${existingNew.id})`);
    }

    let payment = findUnique(categories, PAYMENT_NAME, null, 'payment category');
    if (!payment) {
      payment = await tx.category.create({ data: { name: PAYMENT_NAME } });
      categories.push(payment);
      console.log(`+ create ${PAYMENT_NAME} (id=${payment.id})`);
    } else {
      console.log(`· exists ${PAYMENT_NAME} (id=${payment.id})`);
    }

    for (const name of PAYMENT_CHILDREN) {
      let child = findUnique(categories, name, dailyCategory.id, 'payment source child');
      if (!child) {
        child = findUnique(categories, name, payment.id, 'payment child');
        if (!child) {
          console.log(`· skip missing ${name}`);
          continue;
        }
      } else {
        const count = await tx.transaction.count({ where: { categoryId: child.id } });
        const sum = await tx.transaction.aggregate({ where: { categoryId: child.id }, _sum: { amount: true } });
        await tx.category.update({ where: { id: child.id }, data: { parentId: payment.id } });
        console.log(`→ ${name} -> ${PAYMENT_NAME}: ${count} transactions, ¥${money(sum._sum.amount).toFixed(2)}`);
      }
    }

    if (!APPLY) throw new DryRunAbort();
  }, { timeout: 120000, maxWait: 10000 }).catch((error) => {
    if (!(error instanceof DryRunAbort)) throw error;
  });

  const after = await snapshot(prisma);
  if (after.transactionCount !== before.transactionCount) throw new Error('transaction count changed');
  if (Math.abs(after.transactionTotal - before.transactionTotal) > 0.01) throw new Error('transaction total changed');
  console.log(`After:  ${after.transactionCount} transactions, total ¥${after.transactionTotal.toFixed(2)}`);
  console.log(APPLY ? '✔ migration applied; transaction invariants OK' : '(dry-run) no changes written');
}

run()
  .catch((error) => {
    console.error('\n✖ migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
