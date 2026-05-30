'use client';

import { useMemo } from 'react';
import { Empty, NavBar } from 'antd-mobile';
import ReactMarkdown from 'react-markdown';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@components/loading';
import { useLifeReports } from '@utils/ai-report';
import styles from '../../ai-reports/[id]/report.module.scss';

const formatDate = (value?: string | Date | null) => {
  if (!value) return '未知日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

export default function LifeReportDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { reports, loading } = useLifeReports();
  const report = useMemo(() => reports.find((item) => item.reportKey === params.id) ?? null, [params.id, reports]);
  const initialLoading = loading && reports.length === 0;

  return (
    <main className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        作息报告
      </NavBar>

      {initialLoading ? (
        <LoadingState label="报告加载中" />
      ) : report ? (
        <>
          <header className={styles.header}>
            <div className={styles.meta}>
              <span>{report.badge}</span>
              <em>{formatDate(report.reportDate)}</em>
            </div>
            <h1>{report.title}</h1>
            <p>{report.summary}</p>
          </header>

          <article className={styles.content}>
            <ReactMarkdown>{report.content}</ReactMarkdown>
          </article>
        </>
      ) : (
        <Empty style={{ padding: '72px 0' }} description="报告不存在" />
      )}
    </main>
  );
}