#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { setAppDatabaseUrl } from './database-url.mjs';

setAppDatabaseUrl();

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();
const PARENT_NAME = '休闲/玩乐/运动';
const TARGET_NAMES = ['健康零食', '不健康零食', '健身'];
const SOURCE_GROUPS = [
  { target: '健康零食', sources: ['无糖饮料', '营养品'] },
  { target: '不健康零食', sources: ['零食饮料', '垃圾食品'] },
];

class DryRunAbort extends Error {
  constructor() {
    super('dry-run abort');
    this.name = 'DryRunAbort';
  }
}

const money = (value) => Number((value ?? 0).toFixed(2));

const findUniqueCategory = (categories, name, parentId, description) => {
  const matches = categories.filter((category) => category.name === name && category.parentId === parentId);
  if (matches.length > 1) {
    throw new Error(`ambiguous ${description}: "${name}" has ${matches.length} matches under parentId=${parentId}`);
  }
  return matches[0] ?? null;
};

const getSubtree = (categories, rootId) => {
  const childrenByParent = new Map();
  for (const category of categories) {
    const children = childrenByParent.get(category.parentId) ?? [];
    children.push(category);
    childrenByParent.set(category.parentId, children);
  }

  const result = [];
  const visit = (categoryId) => {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;
    result.push(category);
    for (const child of childrenByParent.get(category.id) ?? []) visit(child.id);
  };
  visit(rootId);
  return result;
};

const categoryPath = (categories, category) => {
  const names = [category.name];
  let parentId = category.parentId;
  while (parentId != null) {
    const parent = categories.find((item) => item.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(' > ');
};

const snapshot = async (client) => {
  const [transactions, categories] = await Promise.all([
    client.transaction.findMany({ select: { categoryId: true, amount: true } }),
    client.category.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return {
    transactionCount: transactions.length,
    transactionTotal: money(transactions.reduce((total, transaction) => total + transaction.amount, 0)),
    categories,
  };
};

const buildPlan = async (tx, initialCategories) => {
  const categories = [...initialCategories];
  const parent = findUniqueCategory(categories, PARENT_NAME, null, 'parent category');
  if (!parent) throw new Error(`parent category not found: "${PARENT_NAME}"`);

  const targetByName = new Map();
  for (const name of TARGET_NAMES) {
    let target = findUniqueCategory(categories, name, parent.id, 'target category');
    if (!target) {
      target = await tx.category.create({ data: { name, parentId: parent.id } });
      categories.push(target);
      console.log(`+ create ${categoryPath(categories, target)} -> id=${target.id}`);
    } else {
      console.log(`· exists ${categoryPath(categories, target)} -> id=${target.id}`);
    }
    if (categories.some((category) => category.parentId === target.id)) {
      throw new Error(`target category must be a leaf: "${name}"`);
    }
    targetByName.set(name, target);
  }

  const moves = [];
  for (const group of SOURCE_GROUPS) {
    const target = targetByName.get(group.target);
    for (const sourceName of group.sources) {
      const source = findUniqueCategory(categories, sourceName, parent.id, 'source category');
      if (!source) {
        console.log(`· skip missing source ${sourceName}`);
        continue;
      }
      if (source.id === target.id) throw new Error(`source and target are identical: ${sourceName}`);
      const subtree = getSubtree(categories, source.id);
      const ids = subtree.map((category) => category.id);
      const summary = await tx.transaction.aggregate({
        where: { categoryId: { in: ids } },
        _count: { _all: true },
        _sum: { amount: true },
      });
      moves.push({ source, subtree, target, count: summary._count._all, total: money(summary._sum.amount) });
    }
  }

  return { categories, targetByName, moves };
};

async function run() {
  const before = await snapshot(prisma);
  console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY RUN'} ===`);
  console.log(`Before: ${before.transactionCount} transactions, total ¥${before.transactionTotal.toFixed(2)}`);

  try {
    await prisma.$transaction(async (tx) => {
      const plan = await buildPlan(tx, before.categories);
      for (const move of plan.moves) {
        const ids = move.subtree.map((category) => category.id);
        console.log(`→ ${move.subtree.map((category) => category.name).join(', ')} -> ${move.target.name}: ${move.count} transactions, ¥${move.total.toFixed(2)}`);
        await tx.transaction.updateMany({ where: { categoryId: { in: ids } }, data: { categoryId: move.target.id } });
        for (const category of [...move.subtree].reverse()) {
          await tx.category.delete({ where: { id: category.id } });
        }
      }
      if (!APPLY) throw new DryRunAbort();
    }, { timeout: 120000, maxWait: 10000 }).catch((error) => {
      if (!(error instanceof DryRunAbort)) throw error;
    });
  } catch (error) {
    throw error;
  }

  const after = await snapshot(prisma);
  if (after.transactionCount !== before.transactionCount) {
    throw new Error(`transaction count changed by ${after.transactionCount - before.transactionCount}`);
  }
  if (Math.abs(after.transactionTotal - before.transactionTotal) > 0.01) {
    throw new Error(`transaction total changed by ${(after.transactionTotal - before.transactionTotal).toFixed(2)}`);
  }

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
