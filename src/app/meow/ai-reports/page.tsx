'use client';

import { Empty, NavBar } from 'antd-mobile';
import { useRouter } from 'next/navigation';
import { useStockAiReports } from '@utils/stock';
import styles from './reports.module.scss';

const formatDate = (value?: string | Date | null) => {
  if (!value) return '未知日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

export default function AiReportsPage() {
  const router = useRouter();
  const { reports, loading } = useStockAiReports();

  return (
    <main className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        AI研报
      </NavBar>

      <header className={styles.header}>
        <h1>AI研报</h1>
        <p>基本面、事件冲击与后续跟踪点</p>
      </header>

      {reports.length > 0 ? (
        <section className={styles.reportList}>
          {reports.map((report) => (
            <button
              key={report.id}
              type="button"
              className={styles.reportCard}
              onClick={() => router.push(`/meow/ai-reports/${report.id}`)}
            >
              <div className={styles.reportTopline}>
                <span>{report.symbol}</span>
                <em>{formatDate(report.reportDate)}</em>
              </div>
              <strong>{report.title}</strong>
              <p>{report.summary}</p>
            </button>
          ))}
        </section>
      ) : (
        <Empty style={{ padding: '72px 0' }} description={loading ? '研报加载中' : '暂无研报'} />
      )}
    </main>
  );
}
