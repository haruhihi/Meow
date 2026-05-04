import { unstable_noStore as noStore } from 'next/cache';
import { getArticles } from '@libs/article-db';
import ArticlesList from './articles-list';
import styles from './articles.module.scss';

export const dynamic = 'force-dynamic';

export default async function ArticlesPage() {
  noStore();
  const articles = await getArticles();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>文章</h1>
          <p>{articles.length} 篇已同步文章</p>
        </div>
      </header>

      <ArticlesList articles={articles} />
    </main>
  );
}
