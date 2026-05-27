import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockSnapshotListReq, IStockSnapshotListRes } from '@dtos/meow';
import { listStockSnapshots } from '../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json().catch(() => ({}))) as IStockSnapshotListReq;
    const snapshots = await listStockSnapshots(uid, body.limit ?? 60);

    return success<IStockSnapshotListRes>({ snapshots });
  } catch (error) {
    return fail(error);
  }
}