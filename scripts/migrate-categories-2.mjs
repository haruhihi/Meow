// Round 2 category migration. Run:
//   node scripts/migrate-categories-2.mjs            # dry-run
//   node scripts/migrate-categories-2.mjs --apply    # commit
//
// Safety contract (identical to round 1):
// - Transaction rows are NEVER deleted. Only categoryId updated.
// - A Category is deleted only after all referencing transactions are remapped
//   AND it has no children.
// - Everything runs inside prisma.$transaction; any failure rolls back.

import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, 'logs');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const APPLY = process.argv.includes('--apply');

// ---------------- Plan ----------------

// Existing ids we rely on (verified via scripts/dump-tree.mjs):
//   2   休闲玩乐   → rename to 休闲/玩乐/运动
//   6   日用百货   → rename to 缴费/日用/百货
//   36  个护       → rename to 美妆个护
//   97  水电煤     → rename to 水费
//   127 居家缴费 (top) → to be merged/deleted after moving its children under 6
//   128 运动健身 (top) → to be merged/deleted after moving 83 under 2

const RENAMES = [
  [2, '休闲/玩乐/运动'],
  [6, '缴费/日用/百货'],
  [36, '美妆个护'],
  [97, '水费'],
];

// New children under parent id=6 (renamed to 缴费/日用/百货).
const NEW_BAIHUO_CHILDREN = ['卧室用品', '房屋装饰', '电费', '燃气费', '物业费'];

// Moves: [categoryId, newParentId|name]
const MOVES = [
  // 居家缴费 (127) children → 6
  [71, 6],   // 话费
  [97, 6],   // 水费 (was 水电煤)
  // 美妆 (76) → 美妆个护 (36)
  [76, 36],
  // 床品 → 卧室用品
  [100, '卧室用品'],
  // 装饰 / 绿植 / 桌布 / 围裙 → 房屋装饰
  [60, '房屋装饰'],
  [104, '房屋装饰'],
  [40, '房屋装饰'],
  [41, '房屋装饰'],
  // 运动户外 → 休闲/玩乐/运动 (id=2)
  [83, 2],
];

// Merges: [sourceId, targetRef, label]
// 127 and 128 are now-empty tops (after moves), so we delete via merge with 0 txns.
// We still use merge (with remap) to catch any stray transactions safely.
const MERGES = [
  [127, 6, '居家缴费 → 缴费/日用/百货 (collapse top)'],
  [128, 2, '运动健身 → 休闲/玩乐/运动 (collapse top)'],
];

// ---------------- Runner ----------------
const prisma = new PrismaClient();
const log = (...a) => console.log(...a);

class DryRunAbort extends Error {
  constructor() {
    super('dry-run-abort');
  }
}

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
  writeFileSync(join(LOG_DIR, `categories2-before-${ts}.json`), JSON.stringify(beforeCounts, null, 2));

  log(`\n=== Mode: ${APPLY ? 'APPLY (writes committed)' : 'DRY RUN'} ===`);
  log(`Before: ${beforeTotalTxns} transactions, total ¥${beforeTotalAmount.toFixed(2)}, across ${beforeCounts.length} categories.\n`);

  await prisma
    .$transaction(
      async (tx) => {
        // 1) Renames first so any name-based resolution sees new names if needed.
        for (const [id, newName] of RENAMES) {
          const cur = await tx.category.findUnique({ where: { id } });
          if (!cur) {
            log(`! skip rename id=${id}: not found`);
            continue;
          }
          if (cur.name === newName) {
            log(`· rename id=${id}: already "${newName}"`);
            continue;
          }
          await tx.category.update({ where: { id }, data: { name: newName } });
          log(`~ rename id=${id}: "${cur.name}" → "${newName}"`);
        }

        // 2) Create new children under 6.
        const nameToId = new Map();
        for (const name of NEW_BAIHUO_CHILDREN) {
          const existing = await tx.category.findFirst({ where: { name, parentId: 6 } });
          const id = existing
            ? existing.id
            : (await tx.category.create({ data: { name, parentId: 6 } })).id;
          nameToId.set(name, id);
          log(`${existing ? '· exists ' : '+ create'} child/6 "${name}" -> id=${id}`);
        }

        const resolve = (ref) => (typeof ref === 'number' ? ref : nameToId.get(ref));

        // 3) Moves.
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

        // 4) Merges: remap transactions, then delete source.
        for (const [fromId, toRef, label] of MERGES) {
          const toId = resolve(toRef);
          if (!toId) throw new Error(`cannot resolve merge target ${toRef} for cat ${fromId}`);
          if (toId === fromId) throw new Error(`refuse to merge id=${fromId} into itself`);
          const from = await tx.category.findUnique({
            where: { id: fromId },
            include: { children: true },
          });
          if (!from) {
            log(`! skip merge id=${fromId}: not found (${label})`);
            continue;
          }
          if (from.children.length > 0) {
            const names = from.children.map((c) => `${c.id}:${c.name}`).join(', ');
            throw new Error(`cannot delete id=${fromId} "${from.name}" — still has children: ${names}`);
          }
          const affected = await tx.transaction.updateMany({
            where: { categoryId: fromId },
            data: { categoryId: toId },
          });
          await tx.category.delete({ where: { id: fromId } });
          log(`⇢ merge id=${fromId} "${from.name}" → id=${toId}  [${label}]  txns remapped=${affected.count}`);
        }

        // 5) Invariants.
        const allTxns = await tx.transaction.findMany({ select: { categoryId: true } });
        const allCatIds = new Set((await tx.category.findMany({ select: { id: true } })).map((c) => c.id));
        const missing = allTxns.filter((t) => !allCatIds.has(t.categoryId));
        if (missing.length > 0) {
          throw new Error(`orphan transactions after migration: ${missing.length}`);
        }

        if (!APPLY) throw new DryRunAbort();
      },
      { timeout: 120_000, maxWait: 10_000 }
    )
    .catch((e) => {
      if (e instanceof DryRunAbort) return;
      throw e;
    });

  const afterCounts = await snapshotCategoryCounts();
  const afterTotalTxns = await prisma.transaction.count();
  const afterTotalAmount = afterCounts.reduce((s, r) => s + r.total, 0);
  writeFileSync(join(LOG_DIR, `categories2-after-${ts}.json`), JSON.stringify(afterCounts, null, 2));

  log(`\nAfter:  ${afterTotalTxns} transactions, total ¥${afterTotalAmount.toFixed(2)}, across ${afterCounts.length} categories.`);
  if (afterTotalTxns !== beforeTotalTxns) {
    log(`!! transaction count changed (${beforeTotalTxns} → ${afterTotalTxns})`);
  }
  if (Math.abs(afterTotalAmount - beforeTotalAmount) > 0.01) {
    log(`!! total amount drifted (¥${beforeTotalAmount.toFixed(2)} → ¥${afterTotalAmount.toFixed(2)})`);
  }
  log(`\nLogs written under ${LOG_DIR}`);
  log(APPLY ? 'Committed.' : 'Dry run — no changes committed. Re-run with --apply to commit.');
}

run()
  .catch((e) => {
    console.error('\nMIGRATION FAILED:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
