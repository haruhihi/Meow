'use client';

import { FC, useMemo } from 'react';
import dayjs from 'dayjs';
import { LeftOutline, RightOutline } from 'antd-mobile-icons';
import { formatMoney, PALETTE } from '@styles/theme';
import type { ITransactionSearchRes, IBudgetSearchRes } from '@dtos/meow';
import styles from './summary-card.module.scss';

interface Props {
  month: dayjs.Dayjs;
  onMonthChange: (m: dayjs.Dayjs) => void;
  transactions: ITransactionSearchRes['transactions'];
  prevMonthTotal?: number;
  budget: IBudgetSearchRes['budgets'][number] | null;
}

export const SummaryCard: FC<Props> = ({ month, onMonthChange, transactions, prevMonthTotal, budget }) => {
  const stats = useMemo(() => {
    const start = month.startOf('month');
    const end = month.endOf('month');
    const inMonth = transactions.filter((t) => {
      const d = dayjs(t.date);
      return d.isAfter(start.subtract(1, 'ms')) && d.isBefore(end.add(1, 'ms'));
    });
    const total = inMonth.reduce((s, t) => s + t.amount, 0);
    const count = inMonth.length;
    const daysSoFar = month.isSame(dayjs(), 'month') ? dayjs().date() : end.date();
    const daily = daysSoFar > 0 ? total / daysSoFar : 0;
    return { total, count, daily };
  }, [transactions, month]);

  const delta = prevMonthTotal != null && prevMonthTotal > 0
    ? ((stats.total - prevMonthTotal) / prevMonthTotal) * 100
    : null;

  const isCurrentMonth = month.isSame(dayjs(), 'month');
  const budgetAmount = budget?.amount ?? 0;
  const pct = budgetAmount > 0 ? Math.min(999, (stats.total / budgetAmount) * 100) : 0;
  const over = budgetAmount > 0 && stats.total > budgetAmount;
  const nearLimit = budgetAmount > 0 && !over && pct >= 80;

  const barColor = over ? PALETTE.danger : nearLimit ? PALETTE.warning : PALETTE.success;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <button
          type="button"
          aria-label="上个月"
          className={styles.navBtn}
          onClick={() => onMonthChange(month.subtract(1, 'month'))}
        >
          <LeftOutline />
        </button>
        <div className={styles.monthLabel}>
          {month.format('YYYY 年 M 月')}
          {isCurrentMonth && <span className={styles.monthTag}>本月</span>}
        </div>
        <button
          type="button"
          aria-label="下个月"
          className={styles.navBtn}
          disabled={isCurrentMonth}
          onClick={() => onMonthChange(month.add(1, 'month'))}
        >
          <RightOutline />
        </button>
      </div>

      <div className={styles.amountRow}>
        <div className={styles.amountLabel}>本月支出</div>
        <div className={styles.amount}>{formatMoney(stats.total)}</div>
        {delta != null && (
          <div
            className={styles.delta}
            style={{ color: delta > 0 ? PALETTE.danger : PALETTE.success }}
          >
            {delta > 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% 环比
          </div>
        )}
      </div>

      <div className={styles.statsRow}>
        <Stat label="笔数" value={`${stats.count}`} />
        <Stat label="日均" value={formatMoney(stats.daily)} />
        <Stat label="上月" value={prevMonthTotal != null ? formatMoney(prevMonthTotal) : '—'} />
      </div>

      {budgetAmount > 0 ? (
        <div className={styles.budgetBlock}>
          <div className={styles.budgetRow}>
            <span>预算 {formatMoney(budgetAmount)}</span>
            <span style={{ color: barColor }}>
              {over ? `超支 ${formatMoney(stats.total - budgetAmount)}` : `剩余 ${formatMoney(budgetAmount - stats.total)}`}
            </span>
          </div>
          <div className={styles.progress}>
            <div
              className={styles.progressInner}
              style={{ width: `${Math.min(100, pct)}%`, background: barColor }}
            />
          </div>
        </div>
      ) : (
        <div className={styles.budgetHint}>未设置本月预算 · 前往「我的」设置</div>
      )}
    </div>
  );
};

const Stat: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={styles.stat}>
    <div className={styles.statValue}>{value}</div>
    <div className={styles.statLabel}>{label}</div>
  </div>
);
