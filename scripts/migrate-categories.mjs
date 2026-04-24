// One-off category migration. Run:
//   node scripts/migrate-categories.mjs           # dry-run (prints plan + before/after diff)
//   node scripts/migrate-categories.mjs --apply   # actually write to DB inside a transaction
//
// Safety contract:
// - Transaction rows are NEVER deleted. We only update categoryId.
// - A Category is only deleted after all Transactions pointing at it have been re-mapped
//   AND it has no children (moves happen first).
// - Everything runs inside prisma.$transaction; any failure rolls everything back.

import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, 'logs');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const APPLY = process.argv.includes('--apply');

// ---------------- Plan ----------------
// New top-level categories to create (parentId: null).
const NEW_TOPS = ['居家缴费', '运动健身'];

// New children to create under existing parent id=2 (休闲玩乐).
const NEW_LEISURE_CHILDREN = ['无糖饮料', '垃圾食品', '酒精类', '咖啡类', '营养品'];

// Moves: list of [categoryId, newParentResolver]
// resolver is either a number (existing id) or a string name (resolve after creates).
const MOVES = [
  // Put 保健品 under 看病买药
  [82, 3],
  // 保健 -> 保健品
  [68, 82],
  // 腰带 -> 医护用品
  [81, 107],
  // 办公文具 -> 日用百货
  [72, 6],
  // 补能 -> 交通出行
  [73, 25],
  // 按摩理疗 -> 看病买药
  [9, 3],
  // 话费 / 水电煤 -> 居家缴费
  [71, '居家缴费'],
  [97, '居家缴费'],
  // 运动户外 -> 运动健身
  [83, '运动健身'],
  // Flatten 18 零食饮料 children into new buckets
  [19, '垃圾食品'],
  [20, '垃圾食品'],
  [21, '垃圾食品'],
  [39, '垃圾食品'],
  [80, '垃圾食品'],
  [85, '垃圾食品'],
  [108, '垃圾食品'],
  [78, '酒精类'],
  [70, '咖啡类'],
  [50, '营养品'],
  [84, '营养品'],
  [86, '营养品'],
  [87, '营养品'],
  [92, '营养品'],
];

// Merges: [sourceId, targetId|targetName, label]
// Update Transaction.categoryId from source -> target, then delete the source Category.
const MERGES = [
  [90, 89, '药类 dup'],
  [98, 62, '理发 dup'],
  [15, 94, '火车 dup (trip → transit)'],
  [105, 104, '绿植装饰 → 绿植'],
  [93, 82, '纯净水 → 保健品'],
  // 18 零食饮料 itself: any transactions still attached go to 垃圾食品 (closest semantics),
  // then the (now-empty) category is deleted.
  [18, '垃圾食品', '零食饮料 → 垃圾食品 (flatten)'],
];

// ---------------- Runner ----------------
const prisma = new PrismaClient();

const log = (...a) => console.log(...a);

async function snapshotCategoryCounts() {
  const grouped = await prisma.transaction.groupBy({
    by: ['categoryId'],
    _count: { _all: true },
    _sum: { amount: true },
  });
  const cats = await prisma.category.findMany();
  const byId = new Map(cats.map((c) => [c.id, c]));
  return grouped
    .map((g) => ({
      categoryId: g.categoryId,
      name: byId.get(g.categoryId)?.name ?? '(unknown)',
      parentId: byId.get(g.categoryId)?.parentId ?? null,
      count: g._count._all,
      total: Number((g._sum.amount ?? 0).toFixed(2)),
    }))
    .sort((a, b) => a.categoryId - b.categoryId);
}

async function run() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  const beforeCounts = await snapshotCategoryCounts();
  const beforeTotalTxns = await prisma.transaction.count();
  const beforeTotalAmount = beforeCounts.reduce((s, r) => s + r.total, 0);

  writeFileSync(join(LOG_DIR, `categories-before-${ts}.json`), JSON.stringify(beforeCounts, null, 2));
  log(`\n=== Mode: ${APPLY ? 'APPLY (writes committed)' : 'DRY RUN'} ===`);
  log(`Before: ${beforeTotalTxns} transactions, total ¥${beforeTotalAmount.toFixed(2)}, across ${beforeCounts.length} categories.\n`);

  await prisma
    .$transaction(
      async (tx) => {
    // 1) Create new categories.
    const nameToId = new Map();

    for (const name of NEW_TOPS) {
      const existing = await tx.category.findFirst({ where: { name, parentId: null } });
      const id = existing
        ? existing.id
        : (await tx.category.create({ data: { name, parentId: null } })).id;
      nameToId.set(name, id);
      log(`${existing ? '· exists ' : '+ create'} top "${name}" -> id=${id}`);
    }

    for (const name of NEW_LEISURE_CHILDREN) {
      const existing = await tx.category.findFirst({ where: { name, parentId: 2 } });
      const id = existing
        ? existing.id
        : (await tx.category.create({ data: { name, parentId: 2 } })).id;
      nameToId.set(name, id);
      log(`${existing ? '· exists ' : '+ create'} child/2 "${name}" -> id=${id}`);
    }

    const resolve = (ref) => (typeof ref === 'number' ? ref : nameToId.get(ref));

    // 2) Moves: update parentId.
    for (const [catId, parentRef] of MOVES) {
      const newParentId = resolve(parentRef);
      if (!newParentId) throw new Error(`cannot resolve parent ${parentRef} for cat ${catId}`);
      const cat = await tx.category.findUnique({ where: { id: catId } });
      if (!cat) {
        log(`! skip move id=${catId}: not found`);
        continue;
      }
      if (cat.parentId === newParentId) {
        log(`· move id=${catId} "${cat.name}" already under parentId=${newParentId}`);
        continue;
      }
      await tx.category.update({ where: { id: catId }, data: { parentId: newParentId } });
      log(`→ move id=${catId} "${cat.name}" parentId ${cat.parentId} → ${newParentId}`);
    }

    // 3) Merges: remap transactions, then delete source category.
    for (const [fromId, toRef, label] of MERGES) {
      const toId = resolve(toRef);
      if (!toId) throw new Error(`cannot resolve merge target ${toRef} for cat ${fromId}`);
      if (toId === fromId) throw new Error(`refuse to merge id=${fromId} into itself`);

      const from = await tx.category.findUnique({ where: { id: fromId }, include: { children: true } });
      if (!from) {
        log(`! skip merge id=${fromId}: not found (${label})`);
        continue;
      }

      // Safety: source must have no children at deletion time (moves should have handled this).
      if (from.children.length > 0) {
        const names = from.children.map((c) => `${c.id}:${c.name}`).join(', ');
        throw new Error(`cannot merge/delete id=${fromId} "${from.name}" — still has children: ${names}`);
      }

      const affected = await tx.transaction.updateMany({
        where: { categoryId: fromId },
        data: { categoryId: toId },
      });

      await tx.category.delete({ where: { id: fromId } });
      log(`⇢ merge id=${fromId} "${from.name}" → id=${toId}  [${label}]  txns remapped=${affected.count}`);
    }

    // 4) Invariants.
    const orphanBudgets = await tx.budget.findMany({
      where: { categoryId: { not: null }, category: null },
    });
    if (orphanBudgets.length > 0) {
      throw new Error(`orphan budgets after migration: ${JSON.stringify(orphanBudgets)}`);
    }

    if (!APPLY) {
      // Abort the transaction so nothing is committed.
      throw new DryRunAbort();
    }
  }, { timeout: 120_000, maxWait: 10_000 })
    .catch((e) => {
      if (e instanceof DryRunAbort) return;
      throw e;
    });

  const afterCounts = await snapshotCategoryCounts();
  const afterTotalTxns = await prisma.transaction.count();
  const afterTotalAmount = afterCounts.reduce((s, r) => s + r.total, 0);

  writeFileSync(join(LOG_DIR, `categories-after-${ts}.json`), JSON.stringify(afterCounts, null, 2));
  log(`\nAfter:  ${afterTotalTxns} transactions, total ¥${afterTotalAmount.toFixed(2)}, across ${afterCounts.length} categories.`);

  // Invariants: transaction count and total amount must be unchanged.
  const txnDelta = afterTotalTxns - beforeTotalTxns;
  const amtDelta = Math.round((afterTotalAmount - beforeTotalAmount) * 100) / 100;
  if (APPLY) {
    if (txnDelta !== 0) throw new Error(`transaction count changed by ${txnDelta}`);
    if (Math.abs(amtDelta) > 0.01) throw new Error(`total amount changed by ${amtDelta}`);

    const txns = await prisma.transaction.findMany({ select: { categoryId: true } });
    const catIds = new Set((await prisma.category.findMany({ select: { id: true } })).map((c) => c.id));
    const orphans = txns.filter((t) => !catIds.has(t.categoryId));
    if (orphans.length !== 0) throw new Error(`${orphans.length} transactions reference deleted categories`);

    log(`\n✔ invariants OK: txns unchanged, total unchanged, no orphan transactions.`);
  } else {
    log(`\n(dry-run) no changes written. Re-run with --apply to commit.`);
  }
}

class DryRunAbort extends Error {
  constructor() { super('dry-run abort'); this.name = 'DryRunAbort'; }
}

run()
  .catch((e) => {
    console.error('\n✖ migration failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
