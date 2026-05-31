'use client';

import { RefObject, useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, DatePickerRef, Dialog, Empty, Form, Input, Modal, NavBar, PullToRefresh, TextArea, Toast } from 'antd-mobile';
import { AddCircleOutline, DeleteOutline, EditSOutline, FileOutline } from 'antd-mobile-icons';
import ReactECharts from 'echarts-for-react';
import { observer } from 'mobx-react-lite';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InlineLoading, LoadingState } from '@components/loading';
import {
  IStockPortfolioSymbolSummary,
  StockDividendEventWithMarking,
  StockHoldingWithAccount,
  StockRemarkListItem,
} from '@dtos/meow';
import { formatMoney, PALETTE } from '@styles/theme';
import { formatStockQuantity } from '@utils/stock-calculations';
import { useStockAiReports, useStockDividends, useStockPortfolio, useStockRemarks } from '@utils/stock';
import styles from './stock-detail.module.scss';

type HoldingFormValues = {
  name: string;
  currentPrice: string;
  quantities: Record<string, string>;
};

type RemarkFormValues = {
  remarkDate: Date;
  content: string;
};

type EditingRemark = StockRemarkListItem | null;

type ValuationMetricMode = 'pe' | 'pb';
type ValuationRangeMode = '1y' | '3y' | '5y' | '10y' | 'all';

const VALUATION_RANGE_OPTIONS: { label: string; value: ValuationRangeMode; years?: number }[] = [
  { label: '1年', value: '1y', years: 1 },
  { label: '3年', value: '3y', years: 3 },
  { label: '5年', value: '5y', years: 5 },
  { label: '10年', value: '10y', years: 10 },
  { label: '全部', value: 'all' },
];
const PE_TARGET_PERCENTILES = [10, 25, 50, 75, 90];
const PE_TARGET_LINE_COLORS = [PALETTE.success, PALETTE.info, PALETTE.warning, PALETTE.warm, PALETTE.danger];

const formatPercent = (value?: number | null) => (value == null ? '—' : `${(value * 100).toFixed(2)}%`);
const formatPercentile = (value?: number | null) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`);
const formatOptionalNumber = (value?: number | null) => {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01) return value.toFixed(4);
  return value.toFixed(2);
};
const formatSignedPercent = (value?: number | null) => (value == null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`);
const formatOptionalMoney = (value?: number | null) => (value == null ? '—' : formatMoney(value));
const formatCagrMeta = (years?: number | null, value?: number | null) => (
  years != null && value != null ? `CAGR${years} ${formatPercent(value)}` : 'CAGR —'
);
const formatNumberWithPercentile = (value?: number | null, percentile?: number | null) => (
  value == null ? '—' : `${formatOptionalNumber(value)}（${formatPercentile(percentile)}）`
);
const formatValuationLegendNumber = (value: number, metric: ValuationMetricMode) => (
  metric === 'pe' ? value.toFixed(1) : value.toFixed(2)
);
const formatDate = (value?: string | Date | null) => {
  if (!value) return '未知日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};
const formatChartDate = (value?: string | Date | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};
const toRemarkDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseRemarkDate = (value?: string | null) => {
  if (!value) return new Date();
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
};
const formatDividendPart = (value: number | null | undefined, prefix: string, suffix = '') =>
  value && value > 0 ? `${prefix}${Number(value.toFixed(4))}${suffix}` : '';
const formatDividendPlan = (event: StockDividendEventWithMarking) => {
  const parts = [
    formatDividendPart(event.cashPerTen, '10派', '元'),
    formatDividendPart(event.bonusSharesPerTen, '10送', '股'),
    formatDividendPart(event.transferSharesPerTen, '10转', '股'),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : event.description || '暂无方案';
};
const isDividendPlan = (event: StockDividendEventWithMarking) => /预案/.test(event.status ?? event.description ?? '');
const DIVIDEND_PREVIEW_COUNT = 4;

const readPeTarget = (summary: IStockPortfolioSymbolSummary, percentile: number) =>
  summary.peValuation?.targets.find((target) => target.percentile === percentile) ?? null;

const readYear = (value?: string | Date | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear();
};

const sortedPositiveValues = (values: Array<number | null | undefined>) => values
  .filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
  .sort((left, right) => left - right);

const percentileRankOfSorted = (values: number[], value?: number | null) => {
  if (value == null || !Number.isFinite(value) || values.length === 0) return null;
  return values.filter((item) => item <= value).length / values.length;
};

const percentileOfSortedValues = (values: number[], percentile: number) => {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  const rank = (percentile / 100) * (values.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;
  const lower = values[lowerIndex];
  const upper = values[upperIndex];
  return lower + (upper - lower) * weight;
};

const metricFreshnessText = (summary: IStockPortfolioSymbolSummary) => {
  const parts = [];
  if (summary.financialDataReportName || summary.financialDataReportDate) {
    parts.push(`财务数据截至 ${summary.financialDataReportName ?? formatDate(summary.financialDataReportDate)}`);
  }
  if (summary.valuationDataSnapshotDate) {
    parts.push(`估值分位截至 ${formatDate(summary.valuationDataSnapshotDate)} 周频快照`);
  }
  return parts.join(' · ');
};

const MetricFreshness = ({ summary }: { summary: IStockPortfolioSymbolSummary }) => {
  const text = metricFreshnessText(summary);
  if (!text) return null;
  return (
    <div className={styles.dataFreshness}>
      {(summary.financialDataReportName || summary.financialDataReportDate) && (
        <strong>财务数据截至 {summary.financialDataReportName ?? formatDate(summary.financialDataReportDate)}</strong>
      )}
      {summary.valuationDataSnapshotDate && <span>· 估值分位截至 {formatDate(summary.valuationDataSnapshotDate)} 周频快照</span>}
    </div>
  );
};

const readCurrentPbPercentile = (summary: IStockPortfolioSymbolSummary) => {
  const pbValues = sortedPositiveValues(summary.peValuation?.valuationHistory.map((item) => item.pb) ?? []);
  return percentileRankOfSorted(pbValues, summary.pb);
};

const readPeTtm = (summary: IStockPortfolioSymbolSummary) => {
  if (!summary.totalShares || summary.totalShares <= 0 || !summary.netProfitTtm || summary.netProfitTtm <= 0) return null;
  return summary.currentPrice * summary.totalShares / summary.netProfitTtm;
};

const MetricGrid = ({ summary }: { summary: IStockPortfolioSymbolSummary }) => (
  <>
    <MetricFreshness summary={summary} />
    <section className={styles.metricGrid}>
      <div><span>扣非 PE</span><strong>{formatNumberWithPercentile(summary.deductedPeTtm ?? summary.deductedPe, summary.peValuation?.currentPercentile)}</strong></div>
      <div><span>PE TTM</span><strong>{formatOptionalNumber(readPeTtm(summary))}</strong></div>
      <div><span>PB</span><strong>{formatNumberWithPercentile(summary.pb, readCurrentPbPercentile(summary))}</strong></div>
      <div><span>扣非 ROE</span><strong>{formatPercent(summary.deductedRoeTtm)}</strong></div>
      <div><span>股息率</span><strong>{formatPercent(summary.normalizedDividendYield)}</strong></div>
      <div><span>商誉</span><strong>{formatPercent(summary.goodwillToNetAsset)}</strong></div>
      <div><span>扣非 PEG</span><strong>{formatOptionalNumber(summary.deductedPeg)}</strong><em>{formatCagrMeta(summary.deductedNetProfitCagrYears, summary.deductedNetProfitCagr5)}</em></div>
      <div><span>含金量</span><strong>{formatOptionalNumber(summary.operatingCashFlowToDeductedNetProfit)}</strong><em>OCF TTM / 扣非净利润 TTM</em></div>
      <div><span>分红覆盖率</span><strong>{formatOptionalNumber(summary.fcfDividendCoverage)}</strong><em>自由现金流TTM / 常态分红</em></div>
    </section>
    {summary.deductedNetProfitTtmWarning && (
      <div className={styles.dataWarning}>{summary.deductedNetProfitTtmWarning}</div>
    )}
  </>
);

const PeValuationBlock = ({ summary }: { summary: IStockPortfolioSymbolSummary }) => {
  const valuation = summary.peValuation;
  const [valuationMetric, setValuationMetric] = useState<ValuationMetricMode>('pe');
  const [valuationRange, setValuationRange] = useState<ValuationRangeMode>('all');
  const [hiddenValuationYears, setHiddenValuationYears] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setHiddenValuationYears(new Set());
  }, [summary.symbol]);

  const rangeCutoffDate = useMemo(() => {
    if (!valuation) return null;
    const rangeOption = VALUATION_RANGE_OPTIONS.find((option) => option.value === valuationRange);
    if (!rangeOption?.years) return null;
    const latestDate = new Date(valuation.valuationHistory[valuation.valuationHistory.length - 1]?.date ?? '');
    if (Number.isNaN(latestDate.getTime())) return null;
    const next = new Date(latestDate);
    next.setFullYear(next.getFullYear() - rangeOption.years);
    return next;
  }, [valuation, valuationRange]);

  const rangeFilteredValuationHistory = useMemo(() => {
    if (!valuation) return [];
    return rangeCutoffDate
      ? valuation.valuationHistory.filter((item) => new Date(item.date).getTime() >= rangeCutoffDate.getTime())
      : valuation.valuationHistory;
  }, [valuation, rangeCutoffDate]);

  const valuationYears = useMemo(() => Array.from(new Set(rangeFilteredValuationHistory
    .map((item) => readYear(item.date))
    .filter((year): year is number => year != null)))
    .sort((left, right) => left - right), [rangeFilteredValuationHistory]);

  const visibleValuationHistory = useMemo(() => {
    return rangeFilteredValuationHistory.filter((item) => {
      const year = readYear(item.date);
      return year == null || !hiddenValuationYears.has(year);
    });
  }, [rangeFilteredValuationHistory, hiddenValuationYears]);

  const visiblePeValues = useMemo(() => sortedPositiveValues(visibleValuationHistory.map((item) => item.pe)), [visibleValuationHistory]);
  const visiblePbValues = useMemo(() => sortedPositiveValues(visibleValuationHistory.map((item) => item.pb)), [visibleValuationHistory]);
  const visiblePercentileLines = useMemo(() => {
    const metricValuesForRank = valuationMetric === 'pe' ? visiblePeValues : visiblePbValues;
    return PE_TARGET_PERCENTILES
      .flatMap((percentile, index) => {
        const value = percentileOfSortedValues(metricValuesForRank, percentile);
        return value == null ? [] : [{ percentile, value, color: PE_TARGET_LINE_COLORS[index % PE_TARGET_LINE_COLORS.length] }];
      });
  }, [valuationMetric, visiblePeValues, visiblePbValues]);

  const currentPercentile = useMemo(
    () => percentileRankOfSorted(visiblePeValues, valuation?.currentPe),
    [valuation?.currentPe, visiblePeValues]
  );

  const visibleTargets = useMemo(() => {
    const currentEps = valuation?.currentPe != null && valuation.currentPe > 0 && summary.currentPrice > 0
      ? summary.currentPrice / valuation.currentPe
      : null;
    return PE_TARGET_PERCENTILES.map((percentile) => {
      const pe = percentileOfSortedValues(visiblePeValues, percentile);
      const price = pe != null && currentEps != null ? pe * currentEps : null;
      return {
        percentile,
        pe,
        price,
        upside: price != null && summary.currentPrice > 0 ? price / summary.currentPrice - 1 : null,
      };
    });
  }, [summary.currentPrice, valuation?.currentPe, visiblePeValues]);

  const visibleProfitHistory = useMemo(() => {
    if (!valuation) return [];
    return rangeCutoffDate
      ? valuation.profitHistory.filter((item) => new Date(`${item.year}-12-31T00:00:00`).getTime() >= rangeCutoffDate.getTime())
      : valuation.profitHistory;
  }, [valuation, rangeCutoffDate]);

  const profitChartOption = useMemo(() => {
    if (!valuation || visibleProfitHistory.length === 0) return null;
    const labels = visibleProfitHistory.map((item) => String(item.year));
    const profits = visibleProfitHistory.map((item) => item.deductedNetProfit == null ? null : Number((item.deductedNetProfit / 100000000).toFixed(2)));
    const yoyValues = visibleProfitHistory.map((item) => item.yoy == null ? null : Number((item.yoy * 100).toFixed(1)));

    return {
      color: [PALETTE.accent, PALETTE.warning],
      grid: { left: 44, right: 40, top: 52, bottom: 28 },
      legend: {
        top: 4,
        data: ['扣非利润', '同比'],
        textStyle: { color: PALETTE.textSub, fontSize: 11 },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (items: any[]) => {
          const title = items[0]?.axisValue ?? '';
          const lines = items.map((item) => {
            const value = Number(item.value ?? 0);
            const text = item.seriesName === '同比' ? `${value.toFixed(1)}%` : `${value.toFixed(2)} 亿`;
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
        axisLabel: { color: PALETTE.textMuted, fontSize: 10, interval: labels.length > 7 ? 1 : 0 },
      },
      yAxis: [
        {
          type: 'value',
          name: '亿元',
          axisLabel: { color: PALETTE.textMuted, fontSize: 10 },
          splitLine: { lineStyle: { color: PALETTE.border, type: 'dashed' } },
        },
        {
          type: 'value',
          name: '同比',
          axisLabel: { color: PALETTE.textMuted, fontSize: 10, formatter: (value: number) => `${value.toFixed(0)}%` },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '扣非利润',
          type: 'bar',
          data: profits,
          barMaxWidth: 18,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
        },
        {
          name: '同比',
          type: 'line',
          yAxisIndex: 1,
          data: yoyValues,
          smooth: true,
          symbolSize: 6,
          lineStyle: { width: 2.5 },
        },
      ],
    };
  }, [valuation, visibleProfitHistory]);

  const valuationChartOption = useMemo(() => {
    if (!valuation || valuation.valuationHistory.length === 0) return null;
    const metricName = valuationMetric === 'pe' ? '扣非 PE' : 'PB';
    const metricHistory = visibleValuationHistory.filter((item) => valuationMetric === 'pe' ? item.pe != null : item.pb != null);
    const history = metricHistory;
    if (history.length === 0) return null;
    const labels = history.map((item) => formatChartDate(item.date));
    const metricValues = history.map((item) => valuationMetric === 'pe' ? item.pe : item.pb);
    const percentileValues = history.map((item) => {
      const value = valuationMetric === 'pe' ? item.pePercentile : item.pbPercentile;
      return value == null ? null : Number((value * 100).toFixed(1));
    });
    const yValues = [...metricValues, ...visiblePercentileLines.map((item) => item.value)]
      .filter((value): value is number => value != null && Number.isFinite(value));
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const yPadding = Math.max((yMax - yMin) * 0.12, yMax * 0.03, 0.5);
    const percentileLineSeries = visiblePercentileLines.map((item) => ({
      name: `${item.percentile}%分位`,
      type: 'line',
      data: labels.map(() => item.value),
      symbol: 'none',
      silent: true,
      tooltip: { show: false },
      lineStyle: { color: item.color, type: 'dashed', width: 1.8, opacity: 0.92 },
      emphasis: { disabled: true },
    }));

    return {
      color: [PALETTE.primary],
      grid: { left: 44, right: 18, top: 52, bottom: 30 },
      legend: {
        top: 4,
        data: [metricName, '历史分位'],
        textStyle: { color: PALETTE.textSub, fontSize: 11 },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (items: any[]) => {
          const title = items[0]?.axisValue ?? '';
          const lines = items.map((item) => {
            const value = Number(item.value);
            const text = Number.isFinite(value)
              ? item.seriesName === '历史分位' ? `${value.toFixed(1)}%` : value.toFixed(2)
              : '-';
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
        axisLabel: {
          color: PALETTE.textMuted,
          fontSize: 10,
          interval: 0,
          formatter: (value: string, index: number) => (index === 0 || index === labels.length - 1 ? value : ''),
        },
      },
      yAxis: [
        {
          type: 'value',
          name: metricName,
          min: Math.max(0, Number((yMin - yPadding).toFixed(2))),
          max: Number((yMax + yPadding).toFixed(2)),
          axisLabel: { color: PALETTE.textMuted, fontSize: 10 },
          splitLine: { lineStyle: { color: PALETTE.border, type: 'dashed' } },
        },
        {
          type: 'value',
          name: '历史分位',
          min: 0,
          max: 100,
          axisLabel: { color: PALETTE.textMuted, fontSize: 10, formatter: (value: number) => `${value.toFixed(0)}%` },
          splitLine: { show: false },
        },
      ],
      series: [
        ...percentileLineSeries,
        {
          name: metricName,
          type: 'line',
          data: metricValues,
          smooth: true,
          symbol: 'none',
          itemStyle: { color: PALETTE.primary },
          lineStyle: { width: 2.4 },
        },
        {
          name: '历史分位',
          type: 'line',
          yAxisIndex: 1,
          data: percentileValues,
          smooth: true,
          symbol: 'none',
          itemStyle: { color: PALETTE.info },
          lineStyle: { color: PALETTE.info, width: 2, opacity: 0.9 },
        },
      ],
    };
  }, [valuation, valuationMetric, visiblePercentileLines, visibleValuationHistory]);

  if (!valuation) return null;

  const midTarget = visibleTargets.find((target) => target.percentile === 50) ?? readPeTarget(summary, 50);
  const visibleSampleCount = valuationMetric === 'pe' ? visiblePeValues.length : visiblePbValues.length;
  const visibleStartDate = visibleValuationHistory[0]?.date ?? valuation.startDate;
  const visibleEndDate = visibleValuationHistory[visibleValuationHistory.length - 1]?.date ?? valuation.endDate;
  return (
    <section className={styles.sectionBlock}>
      <div className={styles.sectionTitleRow}>
        <span>估值</span>
        <em>{formatDate(visibleStartDate)} - {formatDate(visibleEndDate)}</em>
      </div>
      <div className={styles.peRangeSwitch}>
        {VALUATION_RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={valuationRange === option.value ? styles.peRangeSwitchActive : ''}
            aria-pressed={valuationRange === option.value}
            onClick={() => setValuationRange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className={styles.peValuationSummary}>
        <div><span>当前扣非 PE</span><strong>{formatOptionalNumber(valuation.currentPe)}</strong></div>
        <div><span>历史分位</span><strong>{formatPercentile(currentPercentile)}</strong></div>
        <div><span>中位目标</span><strong>{formatOptionalMoney(midTarget?.price)}</strong></div>
        <div><span>中位空间</span><strong>{formatSignedPercent(midTarget?.upside)}</strong></div>
      </div>
      <div className={styles.peChartPanel}>
        <div className={styles.peChartTitle}>扣非利润</div>
        {profitChartOption ? (
          <ReactECharts option={profitChartOption} style={{ width: '100%', height: 240 }} notMerge lazyUpdate />
        ) : (
          <Empty description="暂无扣非利润历史" />
        )}
      </div>
      <div className={styles.peChartPanel}>
        <div className={styles.peChartHeader}>
          <span>{valuationMetric === 'pe' ? 'PE' : 'PB'} 历史 ({visibleSampleCount} 周)</span>
          <div className={styles.peChartSwitch}>
            <button type="button" className={valuationMetric === 'pe' ? styles.peChartSwitchActive : ''} aria-pressed={valuationMetric === 'pe'} onClick={() => setValuationMetric('pe')}>PE</button>
            <button type="button" className={valuationMetric === 'pb' ? styles.peChartSwitchActive : ''} aria-pressed={valuationMetric === 'pb'} onClick={() => setValuationMetric('pb')}>PB</button>
          </div>
        </div>
        {valuationYears.length > 0 && (
          <div className={styles.peYearFilter}>
            <div className={styles.peYearList}>
              {valuationYears.map((year) => {
                const hidden = hiddenValuationYears.has(year);
                return (
                  <button
                    key={year}
                    type="button"
                    className={hidden ? styles.peYearHidden : ''}
                    aria-pressed={!hidden}
                    onClick={() => setHiddenValuationYears((years) => {
                      const next = new Set(years);
                      if (next.has(year)) next.delete(year);
                      else next.add(year);
                      return next;
                    })}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {valuationChartOption ? (
          <>
            <ReactECharts option={valuationChartOption} style={{ width: '100%', height: 250 }} notMerge lazyUpdate />
            {visiblePercentileLines.length > 0 && (
              <div className={styles.pePercentileLegend}>
                {visiblePercentileLines.map((item) => (
                  <span key={item.percentile} style={{ '--line-color': item.color } as React.CSSProperties}>
                    {formatValuationLegendNumber(item.value, valuationMetric)}({item.percentile}%)
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <Empty description="暂无估值历史" />
        )}
      </div>
    </section>
  );
};

const StockDetailPage = observer(function StockDetailPage({ params }: { params: { symbol: string } }) {
  const router = useRouter();
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const { data, loading: portfolioLoading, reQuery, updateHolding, deleteHolding: deleteStockHolding } = useStockPortfolio(0, symbol);
  const { reports, loading: reportsLoading } = useStockAiReports(0, symbol);
  const { remarks, loading: remarksLoading, createRemark, updateRemark, deleteRemark: deleteStockRemark } = useStockRemarks(symbol);
  const { events: dividendEvents, loading: dividendLoading, updateMarking: updateDividendMarking } = useStockDividends(symbol);
  const [remarkVisible, setRemarkVisible] = useState(false);
  const [editingRemark, setEditingRemark] = useState<EditingRemark>(null);
  const [showAllDividends, setShowAllDividends] = useState(false);

  const summary = data?.symbolSummaries.find((item) => item.symbol === symbol) ?? null;
  const holdings = useMemo(
    () => (data?.holdings ?? []).filter((holding) => holding.symbol === symbol),
    [data?.holdings, symbol]
  );

  useEffect(() => {
    setShowAllDividends(false);
  }, [symbol]);

  const visibleDividendEvents = showAllDividends ? dividendEvents : dividendEvents.slice(0, DIVIDEND_PREVIEW_COUNT);

  const refreshActive = async () => {
    await reQuery();
  };

  const saveHolding = async (values: HoldingFormValues) => {
    if (!summary) return;
    try {
      await Promise.all(holdings.map((holding) =>
        updateHolding({
          id: holding.id,
          name: values.name,
          currentPrice: Number(values.currentPrice),
          quantity: Number(values.quantities[String(holding.id)]),
        })
      ));
      await refreshActive();
      Toast.show({ content: '股票持仓已保存' });
    } catch (error) {
      Toast.show({ content: `保存失败: ${(error as any)?.result ?? error}` });
    }
  };

  const deleteHolding = async (holding: StockHoldingWithAccount) => {
    const ok = await Dialog.confirm({ title: '删除持仓', content: `确认删除「${holding.symbol} ${holding.name}」吗？` });
    if (!ok) return;
    try {
      await deleteStockHolding({ id: holding.id });
      Toast.show({ content: '持仓已删除' });
    } catch (error) {
      Toast.show({ content: `删除失败: ${(error as any)?.result ?? error}` });
    }
  };

  const toggleDividendEvent = async (event: StockDividendEventWithMarking, checked: boolean) => {
    try {
      await updateDividendMarking({
        eventId: event.id,
        countTowardNormalizedDividend: checked,
        note: event.marking?.note ?? null,
      });
    } catch (error) {
      Toast.show({ content: `标记失败: ${(error as any)?.result ?? error}` });
    }
  };

  const openCreateRemark = () => {
    setEditingRemark(null);
    setRemarkVisible(true);
  };

  const openEditRemark = (remark: StockRemarkListItem) => {
    setEditingRemark(remark);
    setRemarkVisible(true);
  };

  const saveRemark = async (values: RemarkFormValues) => {
    const content = values.content?.trim();
    if (!content) {
      Toast.show({ content: '请输入评语' });
      return;
    }
    try {
      if (editingRemark) {
        await updateRemark({
          id: editingRemark.id,
          remarkDate: toRemarkDate(values.remarkDate),
          content,
        });
      } else {
        await createRemark({
          symbol,
          remarkDate: toRemarkDate(values.remarkDate),
          content,
        });
      }
      setRemarkVisible(false);
      Toast.show({ content: '已保存' });
    } catch (error) {
      Toast.show({ content: `保存失败: ${(error as any)?.result ?? error}` });
    }
  };

  const deleteRemark = async (remark: StockRemarkListItem) => {
    const ok = await Dialog.confirm({ title: '删除评语', content: `确认删除 ${formatDate(remark.remarkDate)} 的评语吗？` });
    if (!ok) return;
    try {
      await deleteStockRemark({ id: remark.id });
      Toast.show({ content: '已删除' });
    } catch (error) {
      Toast.show({ content: `删除失败: ${(error as any)?.result ?? error}` });
    }
  };

  if (!summary && portfolioLoading) {
    return (
      <main className={styles.page}>
        <NavBar onBack={() => router.back()} className={styles.navbar}>股票详情</NavBar>
        <LoadingState label="股票加载中" />
      </main>
    );
  }

  if (!summary) {
    return (
      <main className={styles.page}>
        <NavBar onBack={() => router.back()} className={styles.navbar}>股票详情</NavBar>
        <Empty style={{ padding: '72px 0' }} description="股票不存在" />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>股票详情</NavBar>

      <PullToRefresh onRefresh={refreshActive}>
        <header className={styles.header}>
          <div>
            <span className={styles.symbolCode}>{summary.symbol}</span>
            <h1>{summary.name}</h1>
            <p>{formatMoney(summary.currentPrice)} · {formatStockQuantity(summary.quantity)} 股 · {formatMoney(summary.marketValue)}</p>
          </div>
          <Button size="small" color="primary" onClick={() => router.push(`/meow/stocks/${encodeURIComponent(symbol)}/financials`)}>
            <span className={styles.buttonText}><FileOutline /> 财报</span>
          </Button>
        </header>

        <MetricGrid summary={summary} />

        <PeValuationBlock summary={summary} />
      <section className={styles.sectionBlock}>
        <div className={styles.sectionTitle}>AI 研报</div>
        {reports.length > 0 ? (
          <div className={styles.reportSwiper}>
            {reports.map((report) => (
              <Link key={report.id} prefetch={false} className={styles.reportCard} href={`/meow/ai-reports/${report.id}`}>
                <span>{formatDate(report.reportDate)}</span>
                <strong>{report.title}</strong>
                <p>{report.summary}</p>
              </Link>
            ))}
          </div>
        ) : reportsLoading ? (
          <LoadingState label="研报加载中" compact />
        ) : (
          <Empty style={{ padding: '28px 0' }} description="暂无研报" />
        )}
      </section>

      <section className={styles.sectionBlock}>
        <div className={styles.sectionTitleRow}>
          <div className={styles.sectionTitle}>投资评语</div>
          <Button size="mini" color="primary" onClick={openCreateRemark}>
            <span className={styles.buttonText}><AddCircleOutline /> 新建</span>
          </Button>
        </div>
        {remarks.length > 0 ? (
          <div className={styles.remarkList}>
            {remarks.map((remark) => (
              <article key={remark.id} className={styles.remarkCard}>
                <div>
                  <strong>{formatDate(remark.remarkDate)}</strong>
                  <p>{remark.content}</p>
                </div>
                <div className={styles.inlineActions}>
                  <Button size="mini" onClick={() => openEditRemark(remark)}><EditSOutline /></Button>
                  <Button size="mini" color="danger" fill="outline" onClick={() => deleteRemark(remark)}><DeleteOutline /></Button>
                </div>
              </article>
            ))}
          </div>
        ) : remarksLoading ? (
          <LoadingState label="评语加载中" compact />
        ) : (
          <Empty style={{ padding: '28px 0' }} description="暂无评语" />
        )}
      </section>

      <section className={styles.sectionBlock}>
        <div className={styles.sectionTitle}>账户股数</div>
        <Form
          layout="horizontal"
          initialValues={{
            name: summary.name,
            currentPrice: String(summary.currentPrice),
            quantities: Object.fromEntries(holdings.map((holding) => [String(holding.id), String(holding.quantity)])),
          }}
          footer={<Button block type="submit" color="primary">保存持仓</Button>}
          onFinish={saveHolding}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入股票名称' }]}> 
            <Input placeholder="股票名称" />
          </Form.Item>
          <Form.Item name="currentPrice" label="现价" rules={[{ required: true, message: '请输入当前价' }]}> 
            <Input placeholder="人民币价格" type="number" />
          </Form.Item>
          {holdings.map((holding) => (
            <div key={holding.id} className={styles.holdingRow}>
              <Form.Item name={['quantities', String(holding.id)]} label={holding.account.name} rules={[{ required: true, message: '请输入股数' }]}> 
                <Input placeholder="股数" type="number" />
              </Form.Item>
              <Button size="mini" color="danger" fill="outline" onClick={() => deleteHolding(holding)}>删除</Button>
            </div>
          ))}
        </Form>
      </section>

      <section className={styles.sectionBlock}>
        <div className={styles.sectionTitle}>分红事件</div>
        {dividendLoading ? (
          <div className={styles.emptyHint}><InlineLoading label="分红加载中" /></div>
        ) : dividendEvents.length > 0 ? (
          <>
            <div className={styles.dividendGrid}>
              {visibleDividendEvents.map((event) => {
                const checked = Boolean(event.marking?.countTowardNormalizedDividend);
                return (
                  <button key={event.id} type="button" className={checked ? styles.dividendCardActive : styles.dividendCard} onClick={() => toggleDividendEvent(event, !checked)}>
                    <strong>{event.reportPeriod ?? '未知报告期'}</strong>
                    <span>{formatDividendPlan(event)}</span>
                    <em>{isDividendPlan(event) ? '预案' : '实施'} · {checked ? '已计入' : '未计入'}</em>
                  </button>
                );
              })}
            </div>
            {dividendEvents.length > DIVIDEND_PREVIEW_COUNT && (
              <button type="button" className={styles.showMoreButton} onClick={() => setShowAllDividends((value) => !value)}>
                {showAllDividends ? '收起' : `展示更多（${dividendEvents.length - DIVIDEND_PREVIEW_COUNT}）`}
              </button>
            )}
          </>
        ) : (
          <div className={styles.emptyHint}>暂无分红事件</div>
        )}
      </section>
      </PullToRefresh>

      <RemarkModal
        key={editingRemark?.id ?? 'create'}
        visible={remarkVisible}
        remark={editingRemark}
        onClose={() => setRemarkVisible(false)}
        onSave={saveRemark}
      />
    </main>
  );
});

export default StockDetailPage;

const RemarkModal: React.FC<{
  visible: boolean;
  remark: EditingRemark;
  onClose: () => void;
  onSave: (values: RemarkFormValues) => Promise<void>;
}> = ({ visible, remark, onClose, onSave }) => (
  <Modal
    visible={visible}
    title={remark ? '修改评语' : '新建评语'}
    closeOnMaskClick
    showCloseButton
    onClose={onClose}
    content={
      <Form
        layout="horizontal"
        initialValues={{
          remarkDate: parseRemarkDate(remark?.remarkDate),
          content: remark?.content ?? '',
        }}
        footer={<Button block type="submit" color="primary">保存</Button>}
        onFinish={onSave}
      >
        <Form.Item
          name="remarkDate"
          label="日期"
          trigger="onConfirm"
          rules={[{ required: true, message: '请选择日期' }]}
          onClick={(e, ref: RefObject<DatePickerRef>) => ref.current?.open()}
        >
          <DatePicker precision="day">
            {(value) => (value ? toRemarkDate(value) : '请选择日期')}
          </DatePicker>
        </Form.Item>
        <Form.Item name="content" label="评语" rules={[{ required: true, message: '请输入评语' }]}> 
          <TextArea placeholder="写下今天的判断、变化或疑问" autoSize={{ minRows: 5, maxRows: 10 }} />
        </Form.Item>
      </Form>
    }
  />
);