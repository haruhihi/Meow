'use client';

import { useEffect, useState } from 'react';
import { Button, Empty, Modal, PullToRefresh, Selector, Switch, Toast } from 'antd-mobile';
import { LeftOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@components/loading';
import {
  IStockDividendListReq,
  IStockDividendListRes,
  IStockDividendMarkingUpdateReq,
  IStockDividendMarkingUpdateRes,
  IStockMagicFormulaItem,
  IStockMagicFormulaMetric,
  IStockMagicFormulaSearchReq,
  IStockMagicFormulaSearchRes,
  StockDividendEventWithMarking,
} from '@dtos/meow';
import { post } from '@libs/fetch';
import styles from './magic-formula.module.scss';

type MetricKey = IStockMagicFormulaMetric['key'];
type SortState = { key: MetricKey; direction: 'asc' | 'desc' } | null;
type RankedMetric = IStockMagicFormulaMetric & { rank: number | null };
type RankedItem = Omit<IStockMagicFormulaItem, 'metrics'> & {
  overallRank: number;
  rankSum: number;
  maxRankSum: number;
  metrics: RankedMetric[];
};
const DIVIDEND_PREVIEW_COUNT = 6;

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const getMetric = (item: RankedItem, key: MetricKey) => item.metrics.find((metric) => metric.key === key) ?? null;
const getSourceMetric = (item: IStockMagicFormulaItem, key: MetricKey) => item.metrics.find((metric) => metric.key === key) ?? null;

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

const buildRankMap = (items: IStockMagicFormulaItem[], metric: IStockMagicFormulaMetric) => {
  const ranked = items
    .map((item) => ({ symbol: item.symbol, value: item.metrics.find((itemMetric) => itemMetric.key === metric.key)?.value ?? null }))
    .filter((item): item is { symbol: string; value: number } => item.value != null && Number.isFinite(item.value))
    .sort((left, right) => metric.direction === 'asc' ? left.value - right.value : right.value - left.value);

  return new Map(ranked.map((item, index) => [item.symbol, index + 1]));
};

const getActiveMetrics = (metrics: IStockMagicFormulaMetric[], selectedSector: string, includePeg: boolean, includeDividendYield: boolean) => {
  const metricKeys: MetricKey[] = selectedSector === '红利'
    ? includeDividendYield
      ? ['deductedRoa', 'deductedPe', 'dividendYield']
      : ['deductedRoa', 'deductedPe']
    : includePeg
      ? ['deductedPe', 'deductedRoe', 'deductedNetProfitCagr5']
      : ['deductedPe', 'deductedRoe'];
  return metricKeys
    .map((key) => metrics.find((metric) => metric.key === key))
    .filter((metric): metric is IStockMagicFormulaMetric => Boolean(metric));
};

const buildRankedItems = (items: IStockMagicFormulaItem[], selectedSector: string, includePeg: boolean, includeDividendYield: boolean): RankedItem[] => {
  const activeMetrics = getActiveMetrics(items[0]?.metrics ?? [], selectedSector, includePeg, includeDividendYield);
  const rankMaps = new Map(activeMetrics.map((metric) => [metric.key, buildRankMap(items, metric)]));
  const missingRank = items.length + 1;
  const maxRankSum = missingRank * activeMetrics.length;

  return items
    .map((item) => {
      const metrics = activeMetrics.map((metric) => ({
        ...(item.metrics.find((itemMetric) => itemMetric.key === metric.key) ?? metric),
        rank: rankMaps.get(metric.key)?.get(item.symbol) ?? null,
      }));
      const rankSum = metrics.reduce((sum, metric) => sum + (metric.rank ?? missingRank), 0);
      return { ...item, metrics, rankSum, maxRankSum, overallRank: 0 };
    })
    .sort((left, right) => left.rankSum - right.rankSum || left.symbol.localeCompare(right.symbol))
    .map((item, index) => ({ ...item, overallRank: index + 1 }));
};

const sortItems = (items: RankedItem[], sort: SortState) => {
  if (!sort) return items;
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...items].sort((left, right) => {
    const leftRank = getMetric(left, sort.key)?.rank;
    const rightRank = getMetric(right, sort.key)?.rank;
    if (leftRank == null && rightRank == null) return left.rankSum - right.rankSum || left.symbol.localeCompare(right.symbol);
    if (leftRank == null) return 1;
    if (rightRank == null) return -1;
    return (leftRank - rightRank) * direction || left.rankSum - right.rankSum || left.symbol.localeCompare(right.symbol);
  });
};

export default function MagicFormulaPage() {
  const router = useRouter();
  const [sector, setSector] = useState('全部关注');
  const [data, setData] = useState<IStockMagicFormulaSearchRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [includePeg, setIncludePeg] = useState(true);
  const [includeDividendYield, setIncludeDividendYield] = useState(false);
  const [sort, setSort] = useState<SortState>(null);
  const [selectedItem, setSelectedItem] = useState<RankedItem | null>(null);
  const [showAllDividends, setShowAllDividends] = useState(false);
  const [dividendEvents, setDividendEvents] = useState<StockDividendEventWithMarking[]>([]);
  const [dividendLoading, setDividendLoading] = useState(false);
  const selectedSymbol = selectedItem?.symbol ?? '';

  const loadData = async (nextSector = sector, background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await post<IStockMagicFormulaSearchReq, IStockMagicFormulaSearchRes>('/api/stock/magic-formula/search', {
        sector: nextSector,
      });
      setData(res);
      setSector(res.selectedSector);
    } catch (error) {
      Toast.show({ content: `加载失败: ${(error as any)?.result ?? error}` });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData('全部关注');
  }, []);

  useEffect(() => {
    setShowAllDividends(false);
  }, [selectedSymbol]);

  const sectorOptions = (data?.sectors ?? ['全部关注', '除红利', '消费', '白酒', '中药', '医药', '红利']).map((item) => ({
    label: item,
    value: item,
  }));
  const isDividendSector = sector === '红利';
  const rankedItems = buildRankedItems(data?.items ?? [], sector, includePeg, includeDividendYield);
  const metricColumns = rankedItems[0]?.metrics ?? [];
  const sortedItems = sortItems(rankedItems, sort);
  const visibleDividendEvents = showAllDividends ? dividendEvents : dividendEvents.slice(0, DIVIDEND_PREVIEW_COUNT);

  const toggleSort = (key: MetricKey) => {
    setSort((current) => current?.key === key
      ? current.direction === 'asc'
        ? { key, direction: 'desc' }
        : null
      : { key, direction: 'asc' });
  };

  const loadDividendEvents = async (symbol: string) => {
    setDividendLoading(true);
    try {
      const res = await post<IStockDividendListReq, IStockDividendListRes>('/api/stock/dividend/events', { symbol });
      setDividendEvents(res.events);
    } catch (error) {
      setDividendEvents([]);
      Toast.show({ content: `分红加载失败: ${(error as any)?.result ?? error}` });
    } finally {
      setDividendLoading(false);
    }
  };

  const openDividendModal = (item: RankedItem) => {
    setSelectedItem(item);
    setShowAllDividends(false);
    setDividendEvents([]);
    void loadDividendEvents(item.symbol);
  };

  const closeDividendModal = () => {
    setSelectedItem(null);
    setShowAllDividends(false);
    setDividendEvents([]);
  };

  const toggleDividendEvent = async (event: StockDividendEventWithMarking, checked: boolean) => {
    if (!selectedSymbol) return;
    try {
      await post<IStockDividendMarkingUpdateReq, IStockDividendMarkingUpdateRes>('/api/stock/dividend/marking/update', {
        eventId: event.id,
        countTowardNormalizedDividend: checked,
        note: event.marking?.note ?? null,
      });
      await loadDividendEvents(selectedSymbol);
      await loadData(sector, true);
      Toast.show({ content: checked ? '已计入常态分红' : '已取消计入' });
    } catch (error) {
      Toast.show({ content: `标记失败: ${(error as any)?.result ?? error}` });
    }
  };

  return (
    <div className={styles.page}>
      <PullToRefresh onRefresh={() => loadData(sector, true)}>
        <section className={styles.header}>
          <div className={styles.headerTop}>
            <button type="button" className={styles.backButton} onClick={() => router.push('/meow/stocks')} aria-label="返回">
              <LeftOutline />
            </button>
            <div>
              <h1>神奇公式</h1>
              <p>同业相对排名 · 先找候选，再做人工判断</p>
            </div>
          </div>
          <Selector
            className={styles.sectorSelector}
            columns={3}
            value={[sector]}
            options={sectorOptions}
            onChange={(value) => {
              const nextSector = String(value[0] ?? sector);
              setSector(nextSector);
              setSort(null);
              void loadData(nextSector);
            }}
          />
          <label className={styles.pegToggle}>
            <span>{isDividendSector ? '红利组加入股息率' : '开启 PEG'}</span>
            <Switch
              checked={isDividendSector ? includeDividendYield : includePeg}
              onChange={(checked) => {
                if (isDividendSector) {
                  setIncludeDividendYield(checked);
                  if (!checked && sort?.key === 'dividendYield') setSort(null);
                } else {
                  setIncludePeg(checked);
                  if (!checked && (sort?.key === 'deductedPeg' || sort?.key === 'deductedNetProfitCagr5')) setSort(null);
                }
              }}
            />
          </label>
          <div className={styles.headerMeta}>
            <span>{data ? `${data.items.length} 只` : '加载中'}</span>
            <span>{data?.updatedAt ? `更新 ${formatDateTime(data.updatedAt)}` : ' '}</span>
          </div>
        </section>

        {loading && !data ? (
          <LoadingState className={styles.loadingBlock} label="正在计算评分" />
        ) : data && data.items.length > 0 ? (
          <section className={styles.matrixCard}>
            <div className={styles.matrixSummary}>
              <span>{sort ? `按 ${metricColumns.find((metric) => metric.key === sort.key)?.label ?? '指标'} ${sort.direction === 'asc' ? '升序' : '降序'}` : '按综合名次排序'}</span>
              <strong>最佳 #{sortedItems[0]?.overallRank ?? 0} · {sortedItems[0]?.rankSum ?? 0}</strong>
            </div>
            <div className={styles.matrixScroller}>
              <table className={styles.matrixTable}>
                <thead>
                  <tr>
                    <th className={styles.stockColumn}>股票</th>
                    {metricColumns.map((metric) => (
                      <th key={metric.key}>
                        <button type="button" className={sort?.key === metric.key ? styles.activeSortButton : styles.sortButton} onClick={() => toggleSort(metric.key)}>
                          <span>{metric.label}</span>
                          <em>{sort?.key === metric.key ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</em>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item) => (
                    <tr key={item.symbol}>
                      <td className={styles.stockColumn}>
                        <button type="button" className={styles.stockCellButton} onClick={() => openDividendModal(item)}>
                          <strong>{item.name}</strong>
                          <span>{item.symbol} · {item.sector}</span>
                          <em>综合 #{item.overallRank} · 名次和 {item.rankSum}</em>
                          {item.flags.length > 0 && <small>{item.flags.join(' · ')}</small>}
                        </button>
                      </td>
                      {metricColumns.map((column) => {
                        const metric = getMetric(item, column.key);
                        const pegMetric = column.key === 'deductedNetProfitCagr5' ? getSourceMetric(item, 'deductedPeg') : null;
                        return (
                          <td key={column.key} className={metric?.rank == null ? styles.missingMetricCell : undefined}>
                            <div className={styles.metricCell}>
                              <strong>{metric?.rank == null ? '—' : `#${metric.rank}`}</strong>
                              <span>{metric?.display ?? '—'}</span>
                              {pegMetric && <em>PEG {pegMetric.display}</em>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <Empty className={styles.empty} description="暂无评分数据" />
        )}

        <div className={styles.footerActions}>
          <Button block fill="outline" loading={refreshing} onClick={() => loadData(sector, true)}>刷新评分</Button>
        </div>
      </PullToRefresh>

      <Modal
        visible={Boolean(selectedItem)}
        title={selectedItem ? `${selectedItem.symbol} ${selectedItem.name}` : '分红事件'}
        closeOnMaskClick
        showCloseButton
        onClose={closeDividendModal}
        content={
          <section className={styles.dividendModal}>
            <p>点击分红方案切换是否计入常态分红，神奇公式会随标记刷新。</p>
            {dividendLoading ? (
              <LoadingState label="分红加载中" compact />
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
              <Empty style={{ padding: '32px 0' }} description="暂无分红事件" />
            )}
          </section>
        }
      />
    </div>
  );
}
