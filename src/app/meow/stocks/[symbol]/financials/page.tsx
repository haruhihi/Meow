'use client';

import { Button, Empty, NavBar, Tabs } from 'antd-mobile';
import { useRouter } from 'next/navigation';
import { useStockFinancialStatements } from '@utils/stock';
import { StockFinancialStatementMappedSection, StockFinancialStatementMappedValue } from '@dtos/meow';
import styles from './financials.module.scss';

const formatNumberValue = (value: number | string | null) => {
  if (value == null || value === '') return '-';
  if (typeof value === 'string') return value;
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${Number((value / 100000000).toFixed(2))}亿`;
  if (abs >= 10000) return `${Number((value / 10000).toFixed(2))}万`;
  return Number(value.toFixed(2)).toString();
};

const formatYoy = (value: number | null) => {
  if (value == null) return '';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
};

const ValueCell = ({ value }: { value: StockFinancialStatementMappedValue }) => (
  <div className={styles.valueCell}>
    <strong>{formatNumberValue(value.value)}</strong>
    {value.yoy != null && <span>{formatYoy(value.yoy)}</span>}
  </div>
);

const StatementTable = ({ section }: { section: StockFinancialStatementMappedSection }) => (
  <section className={styles.tableWrap}>
    <div className={styles.statementTable} style={{ '--period-count': section.periods.length } as React.CSSProperties}>
      <div className={styles.headerCell}>项目 / 字段</div>
      {section.periods.map((period) => (
        <div key={period.reportDate} className={styles.headerCell}>{period.reportName}</div>
      ))}

      {section.rows.map((row) => (
        <div key={`${row.label}-${row.field ?? 'empty'}`} className={styles.rowGroup}>
          <div className={styles.labelCell}>
            <strong>{row.label}</strong>
            <span>{row.field ?? row.note ?? '未确认字段'}</span>
          </div>
          {section.periods.map((period) => (
            <ValueCell key={period.reportDate} value={row.values[period.reportDate] ?? { value: null, yoy: null }} />
          ))}
        </div>
      ))}
    </div>
  </section>
);

export default function StockFinancialsPage({ params }: { params: { symbol: string } }) {
  const router = useRouter();
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const { data, loading, error, reQuery } = useStockFinancialStatements(symbol);

  return (
    <main className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        财报核查
      </NavBar>

      <header className={styles.header}>
        <div>
          <h1>{data ? `${data.symbol} ${data.name}` : symbol}</h1>
          <p>最近 5 期 · 显示中文项目、雪球字段和值</p>
        </div>
      </header>

      {error ? (
        <section className={styles.errorPanel}>
          <strong>加载失败</strong>
          <p>{error}</p>
          <Button size="small" onClick={() => { void reQuery().catch(() => undefined); }}>重试</Button>
        </section>
      ) : data ? (
        <Tabs className={styles.tabs}>
          {data.sections.map((section) => (
            <Tabs.Tab key={section.statement} title={section.title}>
              <StatementTable section={section} />
            </Tabs.Tab>
          ))}
        </Tabs>
      ) : (
        <Empty style={{ padding: '72px 0' }} description={loading ? '财报加载中' : '暂无财报'} />
      )}
    </main>
  );
}