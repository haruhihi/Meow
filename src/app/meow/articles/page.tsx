/* eslint-disable @next/next/no-html-link-for-pages */
import { unstable_noStore as noStore } from 'next/cache';
import { getArticles } from '@libs/article-db';
import styles from './articles.module.scss';

export const dynamic = 'force-dynamic';

const formatDate = (value: string | null) => {
  if (!value) {
    return '未标日期';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
};

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

      <div className={styles.list}>
        {articles.map((article) => (
          <a key={article.id} href={`/meow/articles/${article.id}`} className={styles.item}>
            <div className={styles.itemMeta}>
              <span>{formatDate(article.publishDate)}</span>
              <span>{article.author}</span>
              <span>{article.source}</span>
            </div>
            <h2>{article.title}</h2>
            <p>{article.excerpt}</p>
            {article.tags.length > 0 && (
              <div className={styles.tags}>
                {article.tags.slice(0, 4).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
          </a>
        ))}
      </div>
    </main>
  );
}
