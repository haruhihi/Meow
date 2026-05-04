import { updateArticlePublishDate } from '@libs/article-db';
import { success, fail } from '@libs/fetch';
import { getSession } from '@libs/session';

interface UpdateDateReq {
  id: string;
  publishDate: string | null;
}

export async function POST(request: Request) {
  try {
    const userId = (await getSession())?.userId;
    if (!userId) {
      throw new Error('unauthorized');
    }

    const { id, publishDate } = (await request.json()) as UpdateDateReq;
    if (!id) {
      throw new Error('id is required');
    }

    const next = await updateArticlePublishDate(id, publishDate ?? null);
    return success({ publishDate: next });
  } catch (error) {
    return fail(error);
  }
}
