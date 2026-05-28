import { success, fail } from '@libs/fetch';
import { getUID } from '@libs/session';
import { IStockSnapshotDetailReq, IStockSnapshotDetailRes } from '@dtos/meow';
import { getStockSnapshotDetail } from '../helpers';

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IStockSnapshotDetailReq;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('invalid snapshot id');

    const snapshot = await getStockSnapshotDetail(uid, id);

    return success<IStockSnapshotDetailRes>({ snapshot });
  } catch (error) {
    return fail(error);
  }
}