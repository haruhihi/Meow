import 'server-only';
import { Prisma, PrismaClient } from '@prisma/client';

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

export interface GetArticlesOptions {
  limit?: number;
  offset?: number;
  year?: number | null;
  keyword?: string;
}

export const getArticles = async ({
  limit = 30,
  offset = 0,
  year,
  keyword,
}: GetArticlesOptions = {}): Promise<ArticleListItem[]> => {
  const prisma = getArticlePrisma();

  const conditions: Prisma.Sql[] = [];
  if (year === null) {
    conditions.push(Prisma.sql`publish_date is null`);
  } else if (typeof year === 'number') {
    conditions.push(Prisma.sql`extract(year from publish_date) = ${year}`);
  }

  const trimmed = keyword?.trim();
  if (trimmed) {
    const pattern = `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      Prisma.sql`(title ilike ${pattern} or author ilike ${pattern} or body ilike ${pattern})`,
    );
  }

  const whereSql = conditions.length
    ? Prisma.sql`where ${Prisma.join(conditions, ' and ')}`
    : Prisma.empty;

  const orderSql =
    year === null
      ? Prisma.sql`order by id desc`
      : Prisma.sql`order by publish_date desc nulls last, id desc`;

  const rows = await prisma.$queryRaw<ArticleListRow[]>`
    select
      id::text as id,
      slug,
      title,
      author,
      publish_date as "publishDate",
      source,
      tags,
      regexp_replace(left(body, 180), '\s+', ' ', 'g') as excerpt
    from public.articles
    ${whereSql}
    ${orderSql}
    limit ${limit} offset ${offset}
  `;

  return rows.map(normalizeListItem);
};

export interface ArticleYearCount {
  year: number | null;
  count: number;
}

export const getArticleYearCounts = async (): Promise<{ total: number; years: ArticleYearCount[] }> => {
  const rows = await getArticlePrisma().$queryRaw<{ year: number | null; count: bigint }[]>`
    select
      extract(year from publish_date)::int as year,
      count(*)::bigint as count
    from public.articles
    group by extract(year from publish_date)
    order by year desc nulls last
  `;

  const years = rows.map((r) => ({ year: r.year, count: Number(r.count) }));
  const total = years.reduce((sum, y) => sum + y.count, 0);
  return { total, years };
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

export const updateArticlePublishDate = async (id: string, publishDate: string | null): Promise<string | null> => {
  if (!/^\d+$/.test(id)) {
    throw new Error('invalid article id');
  }

  let nextDate: Date | null = null;
  if (publishDate) {
    const parsed = new Date(publishDate);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('invalid publish date');
    }
    nextDate = parsed;
  }

  const rows = await getArticlePrisma().$queryRaw<{ publishDate: Date | null }[]>`
    update public.articles
    set publish_date = ${nextDate}
    where id = ${BigInt(id)}
    returning publish_date as "publishDate"
  `;

  if (!rows[0]) {
    throw new Error('article not found');
  }

  return toDateString(rows[0].publishDate);
};
