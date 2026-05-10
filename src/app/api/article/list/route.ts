import { getArticles } from '@libs/article-db';
import { success, fail } from '@libs/fetch';
import { getSession } from '@libs/session';

interface ListReq {
  year?: number | null;
  offset?: number;
  limit?: number;
  keyword?: string;
}

export async function POST(request: Request) {
  try {
    const userId = (await getSession())?.userId;
    if (!userId) {
      throw new Error('unauthorized');
    }

    const body = (await request.json().catch(() => ({}))) as ListReq;
    const limit = Math.min(Math.max(body.limit ?? 30, 1), 100);
    const offset = Math.max(body.offset ?? 0, 0);
    const year = body.year === undefined ? undefined : body.year;
    const keyword = typeof body.keyword === 'string' ? body.keyword.slice(0, 100) : undefined;

    const articles = await getArticles({ limit, offset, year, keyword });
    return success({ articles });
  } catch (error) {
    return fail(error);
  }
}
