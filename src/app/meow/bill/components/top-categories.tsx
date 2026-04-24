'use client';

import { FC, useMemo } from 'react';
import dayjs from 'dayjs';
import type { ITransactionSearchRes, ICategoryRes } from '@dtos/meow';
import { getCategoryColorByName, formatMoney } from '@styles/theme';
import { getIconByCategoryName } from '@utils/category';
import styles from './top-categories.module.scss';

interface Props {
  month: dayjs.Dayjs;
  transactions: ITransactionSearchRes['transactions'];
  categories: ICategoryRes['categories'];
  selected?: string | null;
  onSelect?: (topName: string | null) => void;
}

export const TopCategories: FC<Props> = ({ month, transactions, categories, selected, onSelect }) => {
  const items = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const topName = (id: number): string => {
      let cur = byId.get(id);
      const seen = new Set<number>();
      while (cur && cur.parentId != null) {
        if (seen.has(cur.id)) break;
        seen.add(cur.id);
        const p = byId.get(cur.parentId);
        if (!p) break;
        cur = p;
      }
      return cur?.name ?? '其他';
    };

    const start = month.startOf('month');
    const end = month.endOf('month');
    const agg = new Map<string, { total: number; count: number }>();
    let grand = 0;
    transactions.forEach((t) => {
      const d = dayjs(t.date);
      if (d.isBefore(start) || d.isAfter(end)) return;
      grand += t.amount;
      const name = topName(t.category.id);
      const entry = agg.get(name) ?? { total: 0, count: 0 };
      entry.total += t.amount;
      entry.count += 1;
      agg.set(name, entry);
    });

    return {
      grand,
      rows: [...agg.entries()]
        .map(([name, v]) => ({
          name,
          total: v.total,
          count: v.count,
          pct: grand > 0 ? (v.total / grand) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total),
    };
  }, [transactions, categories, month]);

  if (items.rows.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>
        <span>类目分布</span>
        <span className={styles.titleHint}>点击卡片筛选</span>
      </div>
      <div className={styles.scroller}>
        <Chip
          label="全部"
          active={!selected}
          total={items.grand}
          onClick={() => onSelect?.(null)}
          color="#1F2330"
        />
        {items.rows.map((row) => {
          const Icon = getIconByCategoryName(row.name);
          const color = getCategoryColorByName(row.name);
          return (
            <button
              key={row.name}
              type="button"
              className={[styles.card, selected === row.name ? styles.cardActive : ''].join(' ')}
              onClick={() => onSelect?.(selected === row.name ? null : row.name)}
            >
              <div className={styles.cardHeader}>
                <div className={styles.iconWrap} style={{ background: color + '22', color }}>
                  <Icon />
                </div>
                <div className={styles.pct}>{row.pct.toFixed(0)}%</div>
              </div>
              <div className={styles.name}>{row.name}</div>
              <div className={styles.total}>{formatMoney(row.total)}</div>
              <div className={styles.bar}>
                <div className={styles.barInner} style={{ width: `${row.pct}%`, background: color }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const Chip: FC<{ label: string; active: boolean; total: number; color: string; onClick: () => void }> = ({
  label,
  active,
  total,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={[styles.chip, active ? styles.chipActive : ''].join(' ')}
  >
    <div className={styles.chipLabel}>{label}</div>
    <div className={styles.chipTotal}>{formatMoney(total)}</div>
  </button>
);
