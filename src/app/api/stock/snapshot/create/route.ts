import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockSnapshotCreateReq, IStockSnapshotCreateRes } from '@dtos/meow';
import { createStockSnapshot, formatSnapshotMonth, getStockSnapshotMonthState, toStockSnapshotListItem } from '../helpers';

const readSnapshotDate = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('invalid snapshot date');
  return date;
};

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json().catch(() => ({}))) as IStockSnapshotCreateReq;
    const snapshotAt = readSnapshotDate(body.snapshotAt);
    const snapshotMonth = formatSnapshotMonth(snapshotAt);
    const monthState = await getStockSnapshotMonthState(uid, snapshotMonth);

    if (monthState.count > 0 && !body.duplicatePolicy) {
      return success<IStockSnapshotCreateRes>({
        status: 'exists',
        existingSnapshotCount: monthState.count,
        latestSnapshot: monthState.latestSnapshot,
      });
    }

    if (body.duplicatePolicy === 'abort') {
      return success<IStockSnapshotCreateRes>({
        status: 'aborted',
        existingSnapshotCount: monthState.count,
        latestSnapshot: monthState.latestSnapshot,
      });
    }

    const snapshot = await createStockSnapshot(uid, {
      snapshotAt,
      source: body.source ?? 'manual',
      duplicatePolicy: body.duplicatePolicy === 'replace' ? 'replace' : 'append',
    });

    return success<IStockSnapshotCreateRes>({ status: 'created', snapshot: toStockSnapshotListItem(snapshot) });
  } catch (error) {
    return fail(error);
  }
}