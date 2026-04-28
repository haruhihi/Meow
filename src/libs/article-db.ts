import 'server-only';
import { PrismaClient } from '@prisma/client';

const globalForArticlePrisma = global as unknown as { articlePrisma?: PrismaClient };

const getArticlePrisma = () => {
  if (globalForArticlePrisma.articlePrisma) {
    return globalForArticlePrisma.articlePrisma;
  }

  const url = process.env.DATABASE_URL2;
  if (!url) {
    throw new Error('DATABASE_URL2 is required to read articles');
  }

  globalForArticlePrisma.articlePrisma = new PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
  });

  return globalForArticlePrisma.articlePrisma;
};

export interface ArticleListItem {
  id: string;
  slug: string;
  title: string;
  author: string;
  publishDate: string | null;
  source: string;
  tags: string[];
  excerpt: string;
}

export interface ArticleDetail extends ArticleListItem {
  url: string | null;
  notes: string | null;
  body: string;
  bonusBody: string | null;
}

interface ArticleListRow {
  id: string;
  slug: string;
  title: string;
  author: string;
  publishDate: Date | null;
  source: string;
  tags: string[];
  excerpt: string;
}

interface ArticleDetailRow extends ArticleListRow {
  url: string | null;
  notes: string | null;
  body: string;
  bonusBody: string | null;
}

const toDateString = (date: Date | null) => (date ? date.toISOString() : null);

const normalizeListItem = (row: ArticleListRow): ArticleListItem => ({
  ...row,
  publishDate: toDateString(row.publishDate),
});

export const getArticles = async (limit = 100): Promise<ArticleListItem[]> => {
  const rows = await getArticlePrisma().$queryRaw<ArticleListRow[]>`
    select
      id::text as id,
      slug,
      title,
      author,
      publish_date as "publishDate",
      source,
      tags,
      regexp_replace(left(body, 180), '\\s+', ' ', 'g') as excerpt
    from public.articles
    order by publish_date desc nulls last, id desc
    limit ${limit}
  `;

  return rows.map(normalizeListItem);
};

export const getArticleById = async (id: string): Promise<ArticleDetail | null> => {
  if (!/^\d+$/.test(id)) {
    return null;
  }

  const rows = await getArticlePrisma().$queryRaw<ArticleDetailRow[]>`
    select
      id::text as id,
      slug,
      title,
      author,
      publish_date as "publishDate",
      source,
      url,
      tags,
      notes,
      body,
      bonus_body as "bonusBody",
      regexp_replace(left(body, 180), '\\s+', ' ', 'g') as excerpt
    from public.articles
    where id = ${BigInt(id)}
    limit 1
  `;

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    ...normalizeListItem(row),
    url: row.url,
    notes: row.notes,
    body: row.body,
    bonusBody: row.bonusBody,
  };
};
