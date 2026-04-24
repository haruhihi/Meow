'use client';

import { FC, useMemo } from 'react';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import type { ITransactionSearchRes } from '@dtos/meow';
import { PALETTE } from '@styles/theme';

interface Props {
  month: dayjs.Dayjs;
  transactions: ITransactionSearchRes['transactions'];
  height?: number;
}

export const DailyTrendChart: FC<Props> = ({ month, transactions, height = 220 }) => {
  const option = useMemo(() => {
    const daysInMonth = month.daysInMonth();
    const labels: string[] = [];
    const values: number[] = new Array(daysInMonth).fill(0);

    for (let i = 1; i <= daysInMonth; i++) labels.push(String(i));

    const start = month.startOf('month');
    const end = month.endOf('month');
    transactions.forEach((t) => {
      const d = dayjs(t.date);
      if (d.isBefore(start) || d.isAfter(end)) return;
      values[d.date() - 1] += t.amount;
    });

    // 7-day moving average.
    const avg: (number | null)[] = values.map((_, i) => {
      const from = Math.max(0, i - 6);
      const slice = values.slice(from, i + 1);
      return Number((slice.reduce((s, v) => s + v, 0) / slice.length).toFixed(2));
    });

    return {
      grid: { left: 36, right: 12, top: 20, bottom: 24 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: number) => `¥${v.toFixed(2)}`,
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: PALETTE.border } },
        axisLabel: { color: PALETTE.textMuted, fontSize: 10, interval: daysInMonth > 20 ? 2 : 1 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: PALETTE.textMuted, fontSize: 10 },
        splitLine: { lineStyle: { color: PALETTE.border, type: 'dashed' } },
      },
      series: [
        {
          name: '日支出',
          type: 'bar',
          data: values.map((v) => Number(v.toFixed(2))),
          itemStyle: {
            color: PALETTE.primary,
            borderRadius: [4, 4, 0, 0],
          },
          barMaxWidth: 14,
        },
        {
          name: '7日均线',
          type: 'line',
          data: avg,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: PALETTE.warning, width: 2 },
        },
      ],
    };
  }, [month, transactions]);

  return (
    <ReactECharts
      option={option}
      style={{ width: '100%', height }}
      notMerge
      lazyUpdate
    />
  );
};
