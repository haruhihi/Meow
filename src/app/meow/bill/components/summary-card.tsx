'use client';

import { FC, useMemo } from 'react';
import dayjs from 'dayjs';
import { LeftOutline, RightOutline } from 'antd-mobile-icons';
import { formatMoney, PALETTE } from '@styles/theme';
import type { ITransactionSearchRes } from '@dtos/meow';
import styles from './summary-card.module.scss';

interface Props {
  month: dayjs.Dayjs;
  onMonthChange: (m: dayjs.Dayjs) => void;
  transactions: ITransactionSearchRes['transactions'];
  prevMonthTotal?: number;
  couponDiscountTotal?: number;
}

export const SummaryCard: FC<Props> = ({ month, onMonthChange, transactions, prevMonthTotal, couponDiscountTotal = 0 }) => {
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
  const grossTotal = stats.total + couponDiscountTotal;

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

      <div className={styles.couponHint}>
        原始支出 {formatMoney(grossTotal)} · 券抵扣 {formatMoney(couponDiscountTotal)}
      </div>
    </div>
  );
};

const Stat: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={styles.stat}>
    <div className={styles.statValue}>{value}</div>
    <div className={styles.statLabel}>{label}</div>
  </div>
);
