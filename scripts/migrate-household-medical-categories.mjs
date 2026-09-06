#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { setAppDatabaseUrl } from './database-url.mjs';

setAppDatabaseUrl();

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();
const HOUSEHOLD_PARENT = '缴费/日用/百货';
const MEDICAL_PARENT = '看病买药';
const TARGETS = [
  { parent: HOUSEHOLD_PARENT, name: '厨房' },
  { parent: HOUSEHOLD_PARENT, name: '卫生间' },
  { parent: HOUSEHOLD_PARENT, name: '卧室' },
  { parent: HOUSEHOLD_PARENT, name: '护肤' },
  { parent: HOUSEHOLD_PARENT, name: '化妆' },
  { parent: HOUSEHOLD_PARENT, name: '装修' },
  { parent: HOUSEHOLD_PARENT, name: '家居' },
  { parent: MEDICAL_PARENT, name: '药类' },
];

const MOVES = [
  { parent: HOUSEHOLD_PARENT, target: '厨房', source: ['厨房用品'] },
  { parent: HOUSEHOLD_PARENT, target: '厨房', source: ['杯盘餐具'] },
  { parent: HOUSEHOLD_PARENT, target: '厨房', source: ['调味'] },
  { parent: HOUSEHOLD_PARENT, target: '卫生间', source: ['厕所用品'] },
  { parent: HOUSEHOLD_PARENT, target: '卫生间', source: ['清洁用品'] },
  { parent: HOUSEHOLD_PARENT, target: '卫生间', source: ['抹布海绵'] },
  { parent: HOUSEHOLD_PARENT, target: '卫生间', source: ['毛巾面巾'] },
  { parent: HOUSEHOLD_PARENT, target: '卧室', source: ['卧室用品'] },
  { parent: HOUSEHOLD_PARENT, target: '护肤', source: ['美妆个护', '面霜'] },
  { parent: HOUSEHOLD_PARENT, target: '护肤', source: ['美妆个护', '面膜'] },
  { parent: HOUSEHOLD_PARENT, target: '化妆', source: ['美妆个护', '美妆'] },
  { parent: HOUSEHOLD_PARENT, target: '化妆', source: ['美妆个护', '唇膏'] },
  { parent: HOUSEHOLD_PARENT, target: '装修', source: ['房屋装饰'] },
  { parent: HOUSEHOLD_PARENT, target: '家居', source: ['真空收纳袋'] },
  { parent: HOUSEHOLD_PARENT, target: '家居', source: ['暖宝宝'] },
  { parent: HOUSEHOLD_PARENT, target: '家居', source: ['家用电器'] },
  { parent: HOUSEHOLD_PARENT, target: '家居', source: ['五金工具'] },
  { parent: HOUSEHOLD_PARENT, target: '家居', source: ['粘鼠板'] },
  { parent: MEDICAL_PARENT, target: '药类', source: ['贴膏'] },
  { parent: MEDICAL_PARENT, target: '药类', source: ['中药调理'] },
  { parent: MEDICAL_PARENT, target: '药类', source: ['轮椅'], sourceParent: '交通出行' },
];

class DryRunAbort extends Error {}

const money = (value) => Number((value ?? 0).toFixed(2));

const findUnique = (categories, name, parentId, label) => {
  const matches = categories.filter((category) => category.name === name && category.parentId === parentId);
  if (matches.length > 1) throw new Error(`ambiguous ${label}: ${name}`);
  return matches[0] ?? null;
};

const findPath = (categories, path, rootId) => {
  let parentId = rootId;
  let category = null;
  for (const name of path) {
    category = findUnique(categories, name, parentId, 'source category');
    if (!category) return null;
    parentId = category.id;
  }
  return category;
};

const getSubtree = (categories, rootId) => {
  const childrenByParent = new Map();
  for (const category of categories) {
    const children = childrenByParent.get(category.parentId) ?? [];
    children.push(category);
    childrenByParent.set(category.parentId, children);
  }
  const result = [];
  const visit = (id) => {
    const category = categories.find((item) => item.id === id);
    if (!category) return;
    result.push(category);
    for (const child of childrenByParent.get(id) ?? []) visit(child.id);
  };
  visit(rootId);
  return result;
};

const pathLabel = (categories, category) => {
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

const ensureTarget = async (tx, categories, target) => {
  const parent = findUnique(categories, target.parent, null, 'target parent');
  if (!parent) throw new Error(`target parent not found: ${target.parent}`);
  let category = findUnique(categories, target.name, parent.id, 'target category');
  if (!category) {
    category = await tx.category.create({ data: { name: target.name, parentId: parent.id } });
    categories.push(category);
    console.log(`+ create ${pathLabel(categories, category)} -> id=${category.id}`);
  } else {
    console.log(`· exists ${pathLabel(categories, category)} -> id=${category.id}`);
  }
  if (categories.some((item) => item.parentId === category.id)) {
    throw new Error(`target category must be a leaf: ${target.name}`);
  }
  return category;
};

async function run() {
  const before = await snapshot(prisma);
  console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY RUN'} ===`);
  console.log(`Before: ${before.transactionCount} transactions, total ¥${before.transactionTotal.toFixed(2)}`);

  await prisma.$transaction(async (tx) => {
    const categories = [...before.categories];
    const targetByKey = new Map();
    for (const target of TARGETS) {
      targetByKey.set(`${target.parent}:${target.name}`, await ensureTarget(tx, categories, target));
    }

    for (const move of MOVES) {
      const sourceParent = move.sourceParent ?? move.parent;
      const parent = findUnique(categories, sourceParent, null, 'source parent');
      if (!parent) throw new Error(`source parent not found: ${sourceParent}`);
      const source = findPath(categories, move.source, parent.id);
      if (!source) {
        console.log(`· skip missing source ${sourceParent} > ${move.source.join(' > ')}`);
        continue;
      }
      const target = targetByKey.get(`${move.parent}:${move.target}`);
      const subtree = getSubtree(categories, source.id);
      const ids = subtree.map((category) => category.id);
      const summary = await tx.transaction.aggregate({
        where: { categoryId: { in: ids } },
        _count: { _all: true },
        _sum: { amount: true },
      });
      console.log(`→ ${pathLabel(categories, source)} -> ${target.name}: ${summary._count._all} transactions, ¥${money(summary._sum.amount).toFixed(2)}`);
      await tx.transaction.updateMany({ where: { categoryId: { in: ids } }, data: { categoryId: target.id } });
      for (const category of [...subtree].reverse()) {
        await tx.category.delete({ where: { id: category.id } });
        const index = categories.findIndex((item) => item.id === category.id);
        if (index >= 0) categories.splice(index, 1);
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
