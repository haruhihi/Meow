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

const formatPercent = (value?: number | null) => (value == null ? '—' : `${(value * 100).toFixed(2)}%`);
const formatOptionalNumber = (value?: number | null) => {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01) return value.toFixed(4);
  return value.toFixed(2);
};
const formatSignedPercent = (value?: number | null) => (value == null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`);
const formatOptionalMoney = (value?: number | null) => (value == null ? '—' : formatMoney(value));
const formatCagrMeta = (years?: number | null, value?: number | null) => `CAGR${years ?? 5} ${formatPercent(value)}`;
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

const MetricGrid = ({ summary }: { summary: IStockPortfolioSymbolSummary }) => (
  <section className={styles.metricGrid}>
    <div><span>扣非 PE</span><strong>{formatOptionalNumber(summary.deductedPe)} / {formatOptionalNumber(summary.deductedPeTtm)}</strong><em>静 / TTM</em></div>
    <div><span>PE 分位</span><strong>{formatPercent(summary.peValuation?.currentPercentile)}</strong><em>{summary.peValuation?.sampleCount ?? 0} 周样本</em></div>
    <div><span>扣非 PEG</span><strong>{formatOptionalNumber(summary.deductedPeg)}</strong><em>{formatCagrMeta(summary.deductedNetProfitCagrYears, summary.deductedNetProfitCagr5)}</em></div>
    <div><span>PB</span><strong>{formatOptionalNumber(summary.pb)}</strong><em>资产</em></div>
    <div><span>扣非 ROE</span><strong>{formatPercent(summary.deductedRoeTtm)}</strong><em>TTM</em></div>
    <div><span>股息率</span><strong>{formatPercent(summary.normalizedDividendYield)}</strong><em>常态</em></div>
    <div><span>商誉</span><strong>{formatPercent(summary.goodwillToNetAsset)}</strong><em>占净资产 / {formatPercent(summary.goodwillToTotalAssets)}资产</em></div>
    <div><span>现金质量</span><strong>{formatOptionalNumber(summary.operatingCashFlowToDeductedNetProfit)} / {formatOptionalNumber(summary.fcfDividendCoverage)}</strong><em>含金量 / 分红覆盖</em></div>
    <div><span>市值</span><strong>{formatMoney(summary.marketValue)}</strong><em>持仓口径</em></div>
  </section>
);

const PeValuationBlock = ({ summary }: { summary: IStockPortfolioSymbolSummary }) => {
  const valuation = summary.peValuation;
  const [valuationMetric, setValuationMetric] = useState<ValuationMetricMode>('pe');
  const [valuationRange, setValuationRange] = useState<ValuationRangeMode>('5y');

  const profitChartOption = useMemo(() => {
    if (!valuation || valuation.profitHistory.length === 0) return null;
    const labels = valuation.profitHistory.map((item) => String(item.year));
    const profits = valuation.profitHistory.map((item) => item.deductedNetProfit == null ? null : Number((item.deductedNetProfit / 100000000).toFixed(2)));
    const yoyValues = valuation.profitHistory.map((item) => item.yoy == null ? null : Number((item.yoy * 100).toFixed(1)));

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
  }, [valuation]);

  const valuationChartOption = useMemo(() => {
    if (!valuation || valuation.valuationHistory.length === 0) return null;
    const metricName = valuationMetric === 'pe' ? '扣非 PE' : 'PB';
    const metricHistory = valuation.valuationHistory.filter((item) => valuationMetric === 'pe' ? item.pe != null : item.pb != null);
    const rangeOption = VALUATION_RANGE_OPTIONS.find((option) => option.value === valuationRange);
    const latestDate = new Date(metricHistory[metricHistory.length - 1]?.date ?? '');
    const cutoffDate = rangeOption?.years && !Number.isNaN(latestDate.getTime())
      ? new Date(latestDate)
      : null;
    if (cutoffDate && rangeOption?.years) cutoffDate.setFullYear(cutoffDate.getFullYear() - rangeOption.years);
    const history = cutoffDate
      ? metricHistory.filter((item) => new Date(item.date).getTime() >= cutoffDate.getTime())
      : metricHistory;
    if (history.length === 0) return null;
    const labels = history.map((item) => formatChartDate(item.date));
    const metricValues = history.map((item) => valuationMetric === 'pe' ? item.pe : item.pb);
    const percentileValues = history.map((item) => {
      const percentile = valuationMetric === 'pe' ? item.pePercentile : item.pbPercentile;
      return percentile == null ? null : Number((percentile * 100).toFixed(1));
    });

    return {
      color: [PALETTE.primary, PALETTE.success],
      grid: { left: 42, right: 42, top: 52, bottom: 30 },
      legend: {
        top: 4,
        data: [metricName, '历史分位'],
        textStyle: { color: PALETTE.textSub, fontSize: 11 },
      },
      dataZoom: [{ type: 'inside', start: 0, end: 100 }],
      tooltip: {
        trigger: 'axis',
        formatter: (items: any[]) => {
          const title = items[0]?.axisValue ?? '';
          const lines = items.map((item) => {
            const value = Number(item.value ?? 0);
            const text = item.seriesName === '历史分位' ? `${value.toFixed(1)}%` : value.toFixed(2);
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
        axisLabel: { color: PALETTE.textMuted, fontSize: 10, interval: Math.max(0, Math.floor(labels.length / 6)) },
      },
      yAxis: [
        {
          type: 'value',
          name: metricName,
          axisLabel: { color: PALETTE.textMuted, fontSize: 10 },
          splitLine: { lineStyle: { color: PALETTE.border, type: 'dashed' } },
        },
        {
          type: 'value',
          name: '分位',
          min: 0,
          max: 100,
          axisLabel: { color: PALETTE.textMuted, fontSize: 10, formatter: (value: number) => `${value.toFixed(0)}%` },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: metricName,
          type: 'line',
          data: metricValues,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2.4 },
        },
        {
          name: '历史分位',
          type: 'line',
          yAxisIndex: 1,
          data: percentileValues,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2.4 },
          areaStyle: { opacity: 0.08 },
        },
      ],
    };
  }, [valuation, valuationMetric, valuationRange]);

  if (!valuation) return null;

  const midTarget = readPeTarget(summary, 50);
  return (
    <section className={styles.sectionBlock}>
      <div className={styles.sectionTitleRow}>
        <span>PE 估值</span>
        <em>{formatDate(valuation.startDate)} - {formatDate(valuation.endDate)}</em>
      </div>
      <div className={styles.peValuationSummary}>
        <div><span>当前扣非 PE</span><strong>{formatOptionalNumber(valuation.currentPe)}</strong></div>
        <div><span>历史分位</span><strong>{formatPercent(valuation.currentPercentile)}</strong></div>
        <div><span>中位目标</span><strong>{formatOptionalMoney(midTarget?.price)}</strong></div>
        <div><span>中位空间</span><strong>{formatSignedPercent(midTarget?.upside)}</strong></div>
      </div>
      <div className={styles.peTargetTable}>
        {valuation.targets.map((target) => (
          <div key={target.percentile}>
            <span>{target.percentile}%</span>
            <strong>PE {formatOptionalNumber(target.pe)}</strong>
            <em>{formatOptionalMoney(target.price)} · {formatSignedPercent(target.upside)}</em>
          </div>
        ))}
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
          <span>历史分位（周频）</span>
          <div className={styles.peChartSwitch}>
            <button type="button" className={valuationMetric === 'pe' ? styles.peChartSwitchActive : ''} aria-pressed={valuationMetric === 'pe'} onClick={() => setValuationMetric('pe')}>PE</button>
            <button type="button" className={valuationMetric === 'pb' ? styles.peChartSwitchActive : ''} aria-pressed={valuationMetric === 'pb'} onClick={() => setValuationMetric('pb')}>PB</button>
          </div>
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
        {valuationChartOption ? (
          <ReactECharts option={valuationChartOption} style={{ width: '100%', height: 250 }} notMerge lazyUpdate />
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
  const { data, loading: portfolioLoading, reQuery, updateHolding, deleteHolding: deleteStockHolding } = useStockPortfolio();
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