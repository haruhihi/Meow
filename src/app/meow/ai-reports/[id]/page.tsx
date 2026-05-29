'use client';

import { useMemo } from 'react';
import { Empty, NavBar } from 'antd-mobile';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouter } from 'next/navigation';
import { useStockAiReports } from '@utils/stock';
import styles from './report.module.scss';

const formatDate = (value?: string | Date | null) => {
  if (!value) return '未知日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

export default function AiReportDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { reports, loading } = useStockAiReports();
  const report = useMemo(() => reports.find((item) => String(item.id) === params.id) ?? null, [params.id, reports]);

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
      ) : (
        <Empty style={{ padding: '72px 0' }} description={loading ? '报告加载中' : '研报不存在'} />
      )}
    </main>
  );
}