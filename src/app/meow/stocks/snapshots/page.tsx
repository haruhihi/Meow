'use client';

import { useMemo } from 'react';
import { Empty, NavBar } from 'antd-mobile';
import ReactECharts from 'echarts-for-react';
import { useRouter } from 'next/navigation';
import { useStockSnapshots } from '@utils/stock';
import { formatMoney, PALETTE } from '@styles/theme';
import styles from './snapshots.module.scss';

const formatDate = (value?: string | Date | null) => {
  if (!value) return '未知日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

export default function StockSnapshotsPage() {
  const router = useRouter();
  const { snapshots, loading } = useStockSnapshots();
  const latestSnapshot = snapshots[snapshots.length - 1];
  const snapshotList = [...snapshots].reverse();

  const chartOption = useMemo(() => {
    const labels = snapshots.map((snapshot) => formatDate(snapshot.snapshotAt));
    const expectedDividends = snapshots.map((snapshot) => snapshot.summary.expectedDividend);
    const dividendYields = snapshots.map((snapshot) => Number((snapshot.summary.portfolioDividendYield * 100).toFixed(2)));

    return {
      color: [PALETTE.primary, PALETTE.success],
      grid: { left: 48, right: 44, top: 32, bottom: 40 },
      legend: {
        top: 0,
        data: ['预期分红', '综合股息率'],
        textStyle: { color: PALETTE.textSub, fontSize: 11 },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (items: any[]) => {
          const title = items[0]?.axisValue ?? '';
          const lines = items.map((item) => {
            const value = Number(item.value ?? 0);
            const text = item.seriesName === '综合股息率' ? `${value.toFixed(2)}%` : formatMoney(value);
            return `${item.marker}${item.seriesName}: ${text}`;
          });
          return [title, ...lines].join('<br/>');
        },
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: PALETTE.border } },
        axisTick: { show: false },
        axisLabel: { color: PALETTE.textMuted, fontSize: 10, interval: labels.length > 8 ? 1 : 0 },
      },
      yAxis: [
        {
          type: 'value',
          name: '分红',
          axisLabel: { color: PALETTE.textMuted, fontSize: 10, formatter: (value: number) => formatMoney(value) },
          splitLine: { lineStyle: { color: PALETTE.border, type: 'dashed' } },
        },
        {
          type: 'value',
          name: '股息率',
          axisLabel: { color: PALETTE.textMuted, fontSize: 10, formatter: (value: number) => `${value.toFixed(1)}%` },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '预期分红',
          type: 'line',
          data: expectedDividends,
          smooth: true,
          symbolSize: 7,
          lineStyle: { width: 3 },
        },
        {
          name: '综合股息率',
          type: 'line',
          yAxisIndex: 1,
          data: dividendYields,
          smooth: true,
          symbolSize: 7,
          lineStyle: { width: 3 },
        },
      ],
    };
  }, [snapshots]);

  return (
    <main className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        快照趋势
      </NavBar>

      <header className={styles.header}>
        <h1>股票快照</h1>
        <p>预期分红和综合股息率的历史变化</p>
      </header>

      {latestSnapshot && (
        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <strong>{formatMoney(latestSnapshot.summary.expectedDividend)}</strong>
            <span>最新预期分红</span>
          </div>
          <div className={styles.summaryCard}>
            <strong>{formatPercent(latestSnapshot.summary.portfolioDividendYield)}</strong>
            <span>最新综合股息率</span>
          </div>
        </section>
      )}

      {snapshots.length > 0 ? (
        <>
          <section className={styles.chartCard}>
            <ReactECharts option={chartOption} style={{ width: '100%', height: 300 }} notMerge lazyUpdate />
          </section>

          <section className={styles.snapshotList}>
            {snapshotList.map((snapshot) => (
              <article key={snapshot.id} className={styles.snapshotCard}>
                <div className={styles.snapshotTopline}>
                  <strong>{formatDate(snapshot.snapshotAt)}</strong>
                  <span>{snapshot.source === 'manual' ? '手动' : snapshot.source}</span>
                </div>
                <div className={styles.snapshotStats}>
                  <div>
                    <b>{formatMoney(snapshot.summary.expectedDividend)}</b>
                    <em>预期分红</em>
                  </div>
                  <div>
                    <b>{formatPercent(snapshot.summary.portfolioDividendYield)}</b>
                    <em>综合股息率</em>
                  </div>
                  <div>
                    <b>{formatMoney(snapshot.summary.totalAssetValue)}</b>
                    <em>总资产</em>
                  </div>
                </div>
                <p>{snapshot.summary.symbolCount} 只股票 · {snapshot.summary.holdingCount} 个持仓 · {snapshot.snapshotMonth}</p>
              </article>
            ))}
          </section>
        </>
      ) : (
        <Empty style={{ padding: '72px 0' }} description={loading ? '快照加载中' : '暂无股票快照'} />
      )}
    </main>
  );
}