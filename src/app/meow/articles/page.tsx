import { unstable_noStore as noStore } from 'next/cache';
import { getArticles, getArticleYearCounts } from '@libs/article-db';
import ArticlesList from './articles-list';
import styles from './articles.module.scss';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export default async function ArticlesPage() {
  noStore();
  const [{ total, years }, articles] = await Promise.all([
    getArticleYearCounts(),
    getArticles({ limit: PAGE_SIZE, offset: 0 }),
  ]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>文章</h1>
          <p>{total} 篇已同步文章</p>
        </div>
      </header>

      <ArticlesList
        initialArticles={articles}
        yearCounts={years}
        total={total}
        pageSize={PAGE_SIZE}
      />
    </main>
  );
}
