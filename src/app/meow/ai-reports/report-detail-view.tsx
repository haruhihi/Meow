'use client';

import { Empty, NavBar } from 'antd-mobile';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@components/loading';
import { StockAiReportListItem } from '@dtos/meow';
import styles from './[id]/report.module.scss';

const formatDate = (value?: string | Date | null) => {
  if (!value) return '未知日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

export const AiReportDetailView = ({
  report,
  loading,
  emptyDescription = '研报不存在',
}: {
  report: StockAiReportListItem | null;
  loading: boolean;
  emptyDescription?: string;
}) => {
  const router = useRouter();

  return (
    <main className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        AI报告
      </NavBar>

      {report ? (
        <>
          <header className={styles.header}>
            <div className={styles.meta}>
              <span>{report.symbol}</span>
              <em>{formatDate(report.reportDate)}</em>
            </div>
            <h1>{report.title}</h1>
            <p>{report.summary}</p>
          </header>

          <article className={styles.content}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.content}</ReactMarkdown>
          </article>

          {report.sourceLinks.length > 0 && (
            <section className={styles.sources}>
              <h2>源数据</h2>
              <div className={styles.sourceList}>
                {report.sourceLinks.map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                ))}
              </div>
            </section>
          )}
        </>
      ) : loading ? (
        <LoadingState label="报告加载中" />
      ) : (
        <Empty style={{ padding: '72px 0' }} description={emptyDescription} />
      )}
    </main>
  );
};