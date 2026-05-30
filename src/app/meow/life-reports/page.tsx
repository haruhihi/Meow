'use client';

import { Empty, NavBar } from 'antd-mobile';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@components/loading';
import { useLifeReports } from '@utils/ai-report';
import styles from '../ai-reports/reports.module.scss';

const formatDate = (value?: string | Date | null) => {
  if (!value) return '未知日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

export default function LifeReportsPage() {
  const router = useRouter();
  const { reports, loading } = useLifeReports();
  const initialLoading = loading && reports.length === 0;

  return (
    <main className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        作息报告
      </NavBar>

      <header className={styles.header}>
        <h1>作息报告</h1>
        <p>睡眠、时间分配、运动恢复与节律优化</p>
      </header>

      {initialLoading ? (
        <LoadingState label="报告加载中" />
      ) : reports.length > 0 ? (
        <section className={styles.reportList}>
          {reports.map((report) => (
            <button
              key={report.reportKey}
              type="button"
              className={styles.reportCard}
              onClick={() => router.push(`/meow/life-reports/${report.reportKey}`)}
            >
              <div className={styles.reportTopline}>
                <span>{report.badge}</span>
                <em>{formatDate(report.reportDate)}</em>
              </div>
              <strong>{report.title}</strong>
              <p>{report.summary}</p>
            </button>
          ))}
        </section>
      ) : (
        <Empty style={{ padding: '72px 0' }} description="暂无作息报告" />
      )}
    </main>
  );
}