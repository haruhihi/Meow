'use client';

import { useEffect } from 'react';
import { Empty, NavBar } from 'antd-mobile';
import { observer } from 'mobx-react-lite';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@components/loading';
import { useStockAiReports } from '@utils/stock';
import styles from './reports.module.scss';

const SCROLL_KEY = 'meow.aiReports.scrollY';

const formatDate = (value?: string | Date | null) => {
  if (!value) return '未知日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

const AiReportsPage = observer(function AiReportsPage() {
  const router = useRouter();
  const { reports, loading } = useStockAiReports();

  useEffect(() => {
    const value = window.sessionStorage.getItem(SCROLL_KEY);
    if (!value) return;
    window.sessionStorage.removeItem(SCROLL_KEY);
    requestAnimationFrame(() => window.scrollTo(0, Number(value) || 0));
  }, [reports.length]);

  const rememberScroll = () => {
    window.sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  };

  return (
    <main className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        AI报告
      </NavBar>

      <header className={styles.header}>
        <h1>AI报告</h1>
        <p>基本面、事件冲击与后续跟踪点</p>
      </header>

      {reports.length > 0 ? (
        <section className={styles.reportList}>
          {reports.map((report) => (
            <Link
              key={report.id}
              prefetch={false}
              className={styles.reportCard}
              href={`/meow/ai-reports/${report.id}`}
              onClick={rememberScroll}
            >
              <div className={styles.reportTopline}>
                <span>{report.symbol}</span>
                <em>{formatDate(report.reportDate)}</em>
              </div>
              <strong>{report.title}</strong>
              <p>{report.summary}</p>
            </Link>
          ))}
        </section>
      ) : loading ? (
        <LoadingState label="报告加载中" />
      ) : (
        <Empty style={{ padding: '72px 0' }} description="暂无研报" />
      )}
    </main>
  );
});

export default AiReportsPage;
