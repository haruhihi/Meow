import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { getArticleById } from '@libs/article-db';
import styles from '../articles.module.scss';
import PublishDateEditor from './publish-date-editor';

export const dynamic = 'force-dynamic';

const articleUrlTransform = (url: string, key: string) => {
  if (key === 'src' && url.startsWith('data:image/')) {
    return url;
  }

  return defaultUrlTransform(url);
};

export default async function ArticleDetailPage({ params }: { params: { id: string } }) {
  noStore();
  const article = await getArticleById(params.id);

  if (!article) {
    notFound();
  }

  return (
    <main className={styles.detailPage}>
      <header className={styles.detailHeader}>
        <Link href="/meow/articles" prefetch={false} className={styles.backLink}>
          返回
        </Link>
        <div className={styles.detailMeta}>
          <PublishDateEditor id={article.id} publishDate={article.publishDate} />
          <span>{article.author}</span>
          <span>{article.source}</span>
        </div>
        <h1>{article.title}</h1>
        {article.tags.length > 0 && (
          <div className={styles.tags}>
            {article.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
        {article.notes && <p className={styles.notes}>{article.notes}</p>}
        {article.url && (
          <a href={article.url} target="_blank" rel="noreferrer" className={styles.sourceLink}>
            查看原文
          </a>
        )}
      </header>

      <article className={styles.content}>
        <ReactMarkdown urlTransform={articleUrlTransform}>{article.body}</ReactMarkdown>
        {article.bonusBody && (
          <section className={styles.bonus}>
            <h2>补充内容</h2>
            <ReactMarkdown urlTransform={articleUrlTransform}>{article.bonusBody}</ReactMarkdown>
          </section>
        )}
      </article>
    </main>
  );
}
