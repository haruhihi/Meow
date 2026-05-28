'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, Form, Input, List, Modal, Picker, PullToRefresh, Selector, Switch, Toast } from 'antd-mobile';
import type { StockAccount } from '@prisma/client';
import { post } from '@libs/fetch';
import {
  IStockCashUpdateReq,
  IStockCashUpdateRes,
  IStockDividendListReq,
  IStockDividendListRes,
  IStockDividendMarkingUpdateReq,
  IStockDividendMarkingUpdateRes,
  IStockHoldingDeleteReq,
  IStockHoldingUpdateReq,
  IStockHoldingUpdateRes,
  IStockPortfolioSymbolSummary,
  IStockRebalanceSaveReq,
  IStockRebalanceSaveRes,
  IStockSnapshotCreateReq,
  IStockSnapshotCreateRes,
  StockDividendEventWithMarking,
  StockHoldingWithAccount,
} from '@dtos/meow';
import { formatMoney } from '@styles/theme';
import { calculateExpectedDividend, calculatePortfolioDividendYield, formatStockQuantity, percentOf } from '@utils/stock-calculations';
import {
  applyRebalanceQuantityDelta,
  buildRebalanceDiff,
  buildRebalanceDraft,
  createRebalanceHolding,
  hasRebalanceChanges,
  REBALANCE_QUANTITY_STEP,
  StockRebalanceDiff,
  StockRebalanceDraft,
} from '@utils/stock-rebalance';
import { useStockPortfolio, useStockSnapshotDetail, useStockSnapshots } from '@utils/stock';
import { RebalancePanel } from './rebalance-panel';
import styles from './stocks.module.scss';

type SymbolFormValues = {
  name: string;
  currentPrice: string;
  quantities: Record<string, string>;
};

type CashFormValues = {
  amount: string;
};

type RebalanceAddHoldingFormValues = {
  accountId: string[];
  symbol: string;
  name: string;
  quantity: string;
  currentPrice: string;
};

const formatPercent = (value: number) => `${(value * 100).toFixed(value > 0 && value < 0.01 ? 2 : 1)}%`;
const formatOptionalNumber = (value?: number | null) => (value == null ? '—' : value.toFixed(1));
const formatOptionalPercent = (value?: number | null) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`);
const formatQuoteTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const formatDate = (value?: string | Date | null) => {
  if (!value) return '未知日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
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

export default function StocksPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [cashModalVisible, setCashModalVisible] = useState(false);
  const [symbolModalVisible, setSymbolModalVisible] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<IStockPortfolioSymbolSummary | null>(null);
  const [dividendEvents, setDividendEvents] = useState<StockDividendEventWithMarking[]>([]);
  const [dividendLoading, setDividendLoading] = useState(false);
  const [includeCashInPosition, setIncludeCashInPosition] = useState(true);
  const [quoteFetchedAt, setQuoteFetchedAt] = useState<string | null>(null);
  const [isQuoteRefreshing, setIsQuoteRefreshing] = useState(false);
  const [isSnapshotSaving, setIsSnapshotSaving] = useState(false);
  const [snapshotConflict, setSnapshotConflict] = useState<IStockSnapshotCreateRes | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null);
  const [snapshotPickerVisible, setSnapshotPickerVisible] = useState(false);
  const [isRebalanceMode, setIsRebalanceMode] = useState(false);
  const [rebalanceDraft, setRebalanceDraft] = useState<StockRebalanceDraft | null>(null);
  const [rebalanceDiff, setRebalanceDiff] = useState<StockRebalanceDiff | null>(null);
  const [rebalanceAddVisible, setRebalanceAddVisible] = useState(false);
  const [isRebalanceSaving, setIsRebalanceSaving] = useState(false);
  const { data, reQuery, refreshQuotes } = useStockPortfolio(refreshKey);
  const { snapshots, reQuery: reQuerySnapshots } = useStockSnapshots(refreshKey);
  const { snapshot: selectedSnapshot, reQuery: reQuerySnapshot } = useStockSnapshotDetail(selectedSnapshotId);

  const isSnapshotView = selectedSnapshotId != null;
  const activeData = isSnapshotView ? selectedSnapshot?.portfolio ?? null : data;
  const displayData = isRebalanceMode && rebalanceDraft ? rebalanceDraft : activeData;
  const accounts = displayData?.accounts ?? [];
  const holdings = displayData?.holdings ?? [];
  const symbolSummaries = displayData?.symbolSummaries ?? [];
  const totalMarketValue = displayData?.totalMarketValue ?? 0;
  const totalAssetValue = displayData?.totalAssetValue ?? totalMarketValue;
  const cashAmount = displayData?.cashAmount ?? 0;
  const positionTotalValue = includeCashInPosition ? totalAssetValue : totalMarketValue;
  const expectedDividend = calculateExpectedDividend(symbolSummaries);
  const portfolioDividendYield = calculatePortfolioDividendYield(totalMarketValue, expectedDividend);
  const isRebalanceCashInvalid = isRebalanceMode && cashAmount < 0;
  const accountOptions = accounts.map((account) => ({ label: account.name, value: String(account.id) }));
  const snapshotOptions = useMemo(() => [
    { label: '当前持仓', value: 'current' },
    ...[...snapshots].reverse().map((snapshot) => ({
      label: formatDate(snapshot.snapshotAt),
      value: String(snapshot.id),
    })),
  ], [snapshots]);
  const selectedSnapshotValue = selectedSnapshotId == null ? 'current' : String(selectedSnapshotId);
  const selectedSnapshotLabel = selectedSnapshotId == null
    ? '当前持仓'
    : selectedSnapshot
      ? formatDate(selectedSnapshot.snapshotAt)
      : '快照加载中';
  const sectorSummaries = useMemo(
    () =>
      (displayData?.sectorSummaries ?? []).map((sector) => ({
        ...sector,
        percent: percentOf(sector.marketValue, positionTotalValue),
        symbols: sector.symbols.map((summary) => ({
          ...summary,
          percent: percentOf(summary.marketValue, positionTotalValue),
        })),
      })),
    [displayData?.sectorSummaries, positionTotalValue]
  );
  const selectedSymbolHoldings = useMemo(
    () => holdings.filter((holding) => holding.symbol === selectedSymbol?.symbol),
    [holdings, selectedSymbol?.symbol]
  );

  useEffect(() => {
    if (!isSnapshotView) return;
    setCashModalVisible(false);
    setSymbolModalVisible(false);
    setSelectedSymbol(null);
    setIsRebalanceMode(false);
    setRebalanceDraft(null);
    setRebalanceDiff(null);
    setRebalanceAddVisible(false);
  }, [isSnapshotView]);

  const refresh = () => setRefreshKey((key) => key + 1);

  const refreshActive = async () => {
    if (isSnapshotView) {
      await Promise.all([reQuerySnapshots(), reQuerySnapshot()]);
      return;
    }
    await reQuery();
  };

  const changeSnapshot = (value: string) => {
    setSelectedSnapshotId(value === 'current' ? null : Number(value));
  };

  const startRebalance = () => {
    if (!data || isSnapshotView) return;
    setRebalanceDraft(buildRebalanceDraft(data));
    setRebalanceDiff(null);
    setIsRebalanceMode(true);
  };

  const cancelRebalance = async () => {
    if (data && rebalanceDraft) {
      const diff = buildRebalanceDiff(data, rebalanceDraft);
      if (hasRebalanceChanges(diff)) {
        const ok = await Dialog.confirm({ title: '放弃调仓', content: '当前调仓草稿还没有保存，确认放弃吗？' });
        if (!ok) return;
      }
    }
    setIsRebalanceMode(false);
    setRebalanceDraft(null);
    setRebalanceDiff(null);
    setRebalanceAddVisible(false);
  };

  const resetRebalance = () => {
    if (!data) return;
    setRebalanceDraft(buildRebalanceDraft(data));
    setRebalanceDiff(null);
  };

  const changeRebalanceQuantity = (holdingId: number, quantityDelta: number) => {
    setRebalanceDraft((draft) => draft ? applyRebalanceQuantityDelta(draft, holdingId, quantityDelta) : draft);
  };

  const addExistingRebalanceHolding = (accountId: number, summary: IStockPortfolioSymbolSummary) => {
    setRebalanceDraft((draft) => draft
      ? createRebalanceHolding(draft, {
          accountId,
          symbol: summary.symbol,
          name: summary.name,
          currentPrice: summary.currentPrice,
          quantity: REBALANCE_QUANTITY_STEP,
        })
      : draft
    );
  };

  const addNewRebalanceHolding = async (values: RebalanceAddHoldingFormValues) => {
    const accountId = Number(values.accountId?.[0]);
    if (!accountId) {
      Toast.show({ content: '请选择账户' });
      return;
    }
    setRebalanceDraft((draft) => draft
      ? createRebalanceHolding(draft, {
          accountId,
          symbol: values.symbol,
          name: values.name,
          quantity: Number(values.quantity),
          currentPrice: Number(values.currentPrice),
        })
      : draft
    );
    setRebalanceAddVisible(false);
  };

  const openRebalanceDiff = () => {
    if (!data || !rebalanceDraft) return;
    const diff = buildRebalanceDiff(data, rebalanceDraft);
    if (!hasRebalanceChanges(diff)) {
      Toast.show({ content: '没有需要保存的调仓' });
      return;
    }
    if (rebalanceDraft.cashAmount < 0) {
      Toast.show({ content: '现金不能为负数' });
      return;
    }
    setRebalanceDiff(diff);
  };

  const saveRebalance = async () => {
    if (!rebalanceDraft || isRebalanceSaving) return;
    setIsRebalanceSaving(true);
    try {
      const payload: IStockRebalanceSaveReq = {
        cashAmount: rebalanceDraft.cashAmount,
        holdingUpdates: rebalanceDraft.holdings
          .filter((holding) => !holding.isDraft && holding.quantity > 0 && holding.quantity !== holding.originalQuantity)
          .map((holding) => ({ id: holding.id, quantity: holding.quantity })),
        holdingDeletes: rebalanceDraft.holdings
          .filter((holding) => !holding.isDraft && holding.originalQuantity > 0 && holding.quantity <= 0)
          .map((holding) => ({ id: holding.id })),
        holdingCreates: rebalanceDraft.holdings
          .filter((holding) => holding.isDraft && holding.quantity > 0)
          .map((holding) => ({
            accountId: holding.accountId,
            symbol: holding.symbol,
            name: holding.name,
            quantity: holding.quantity,
            currentPrice: holding.currentPrice,
          })),
      };
      const res = await post<IStockRebalanceSaveReq, IStockRebalanceSaveRes>('/api/stock/rebalance/save', payload);
      await reQuery();
      Toast.show({ content: `调仓已保存：更新 ${res.updated}，新增 ${res.created}，删除 ${res.deleted}` });
      setIsRebalanceMode(false);
      setRebalanceDraft(null);
      setRebalanceDiff(null);
      setRebalanceAddVisible(false);
    } catch (error) {
      Toast.show({ content: `调仓保存失败: ${(error as any)?.result ?? error}` });
    } finally {
      setIsRebalanceSaving(false);
    }
  };

  const saveCash = async (values: CashFormValues) => {
    try {
      await post<IStockCashUpdateReq, IStockCashUpdateRes>('/api/stock/cash/update', {
        amount: Number(values.amount),
      });
      Toast.show({ content: '现金已保存' });
      setCashModalVisible(false);
      refresh();
    } catch (error) {
      Toast.show({ content: `保存失败: ${(error as any)?.result ?? error}` });
    }
  };

  const refreshWithQuotes = async () => {
    if (isQuoteRefreshing) return;
    setIsQuoteRefreshing(true);
    try {
      const res = await refreshQuotes();
      await reQuery();
      setQuoteFetchedAt(res.fetchedAt);
      if (res.failedSymbols.length > 0) {
        Toast.show({ content: `已更新 ${res.updated} 只，${res.failedSymbols.length} 只未更新` });
      } else {
        Toast.show({ content: `已更新 ${res.updated} 只股票` });
      }
    } catch (error) {
      await reQuery();
      Toast.show({ content: `行情更新失败: ${(error as any)?.result ?? error}` });
    } finally {
      setIsQuoteRefreshing(false);
    }
  };

  const saveSnapshot = async (duplicatePolicy?: IStockSnapshotCreateReq['duplicatePolicy']) => {
    if (isSnapshotSaving) return;
    setIsSnapshotSaving(true);
    if (duplicatePolicy) setSnapshotConflict(null);
    try {
      const res = await post<IStockSnapshotCreateReq, IStockSnapshotCreateRes>('/api/stock/snapshot/create', {
        duplicatePolicy,
      });
      if (res.status === 'exists') {
        setSnapshotConflict(res);
        return;
      }
      if (res.status === 'created' && res.snapshot) {
        await reQuerySnapshots();
        Toast.show({ content: `快照已保存：${formatDate(res.snapshot.snapshotAt)}` });
      }
    } catch (error) {
      Toast.show({ content: `快照保存失败: ${(error as any)?.result ?? error}` });
    } finally {
      setIsSnapshotSaving(false);
    }
  };

  const openSymbolModal = async (summary: IStockPortfolioSymbolSummary) => {
    setSelectedSymbol(summary);
    setDividendEvents([]);
    setSymbolModalVisible(true);
    setDividendLoading(true);
    try {
      const res = await post<IStockDividendListReq, IStockDividendListRes>('/api/stock/dividend/events', {
        symbol: summary.symbol,
      });
      setDividendEvents(res.events);
    } catch (error) {
      Toast.show({ content: `分红加载失败: ${(error as any)?.result ?? error}` });
    } finally {
      setDividendLoading(false);
    }
  };

  const deleteHolding = async (holding: StockHoldingWithAccount) => {
    const ok = await Dialog.confirm({ title: '删除持仓', content: `确认删除「${holding.symbol} ${holding.name}」吗？` });
    if (!ok) return;
    try {
      await post<IStockHoldingDeleteReq, { id: number }>('/api/stock/holding/delete', { id: holding.id });
      Toast.show({ content: '持仓已删除' });
      refresh();
    } catch (error) {
      Toast.show({ content: `删除失败: ${(error as any)?.result ?? error}` });
    }
  };

  const saveSymbol = async (values: SymbolFormValues) => {
    if (!selectedSymbol) return;
    try {
      const updates = selectedSymbolHoldings.map((holding) =>
        post<IStockHoldingUpdateReq, IStockHoldingUpdateRes>('/api/stock/holding/update', {
          id: holding.id,
          name: values.name,
          currentPrice: Number(values.currentPrice),
          quantity: Number(values.quantities[String(holding.id)]),
        })
      );
      await Promise.all(updates);
      Toast.show({ content: '股票持仓已保存' });
      setSymbolModalVisible(false);
      refresh();
    } catch (error) {
      Toast.show({ content: `保存失败: ${(error as any)?.result ?? error}` });
    }
  };

  const toggleDividendEvent = async (event: StockDividendEventWithMarking, checked: boolean) => {
    try {
      await post<IStockDividendMarkingUpdateReq, IStockDividendMarkingUpdateRes>('/api/stock/dividend/marking/update', {
        eventId: event.id,
        countTowardNormalizedDividend: checked,
        note: event.marking?.note ?? null,
      });
      setDividendEvents((events) =>
        events.map((item) =>
          item.id === event.id
            ? { ...item, marking: { countTowardNormalizedDividend: checked, note: item.marking?.note ?? null } }
            : item
        )
      );
      refresh();
    } catch (error) {
      Toast.show({ content: `标记失败: ${(error as any)?.result ?? error}` });
    }
  };

  return (
    <div className={styles.page}>
      <PullToRefresh onRefresh={refreshActive}>
      <section className={styles.summaryCard}>
        <div className={styles.summaryHeader}>
          <div className={styles.summaryActions}>
            <button type="button" className={styles.quoteButton} onClick={() => setSnapshotPickerVisible(true)}>
              {selectedSnapshotLabel}
            </button>
            {!isSnapshotView && (
              isRebalanceMode ? (
                <>
                  <button type="button" className={styles.quoteButton} disabled={isRebalanceCashInvalid || isRebalanceSaving} onClick={openRebalanceDiff}>
                    保存调仓
                  </button>
                  <button type="button" className={styles.quoteButton} disabled={isRebalanceSaving} onClick={cancelRebalance}>
                    取消
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className={styles.quoteButton} disabled={!data} onClick={startRebalance}>
                    编辑
                  </button>
                  <button type="button" className={styles.quoteButton} disabled={isSnapshotSaving} onClick={() => saveSnapshot()}>
                    {isSnapshotSaving ? '保存中...' : '存快照'}
                  </button>
                  <button type="button" className={styles.quoteButton} disabled={isQuoteRefreshing} onClick={refreshWithQuotes}>
                    {isQuoteRefreshing ? '刷新中...' : '刷新数据'}
                  </button>
                </>
              )
            )}
            <label className={styles.positionToggle}>
              <span>计现金</span>
              <Switch checked={includeCashInPosition} onChange={setIncludeCashInPosition} />
            </label>
          </div>
        </div>
        <div className={styles.summaryValueRow}>
          <div className={styles.summaryValue}>{formatMoney(totalAssetValue)}</div>
          <div className={styles.assetInlineStats}>
            <span>股票 {formatMoney(totalMarketValue)}</span>
            <button type="button" disabled={isSnapshotView || isRebalanceMode} onClick={() => setCashModalVisible(true)}>
              现金{isRebalanceMode ? '预估' : ''} {formatMoney(cashAmount)}
            </button>
          </div>
        </div>
        {isRebalanceMode && (
          <div className={isRebalanceCashInvalid ? styles.rebalanceWarning : styles.rebalanceHint}>
            {isRebalanceCashInvalid ? '现金为负，不能保存调仓' : '编辑模式未保存，保存前会先展示差异'}
          </div>
        )}
        {isSnapshotView && selectedSnapshot ? (
          <div className={styles.quoteTime}>快照 {formatDate(selectedSnapshot.snapshotAt)} · {selectedSnapshot.source === 'manual' ? '手动' : selectedSnapshot.source}</div>
        ) : (
          quoteFetchedAt && <div className={styles.quoteTime}>行情 {formatQuoteTime(quoteFetchedAt)}</div>
        )}
        <div className={styles.summaryGrid}>
          <SummaryStat label="持仓" value={`${symbolSummaries.length}`} />
          <SummaryStat label={isRebalanceMode ? '预期分红预估' : '预期分红'} value={formatMoney(expectedDividend)} />
          <SummaryStat label={isRebalanceMode ? '股息率预估' : '综合股息率'} value={formatPercent(portfolioDividendYield)} />
        </div>
      </section>

      {isRebalanceMode && rebalanceDraft && (
        <RebalancePanel
          accounts={rebalanceDraft.accounts}
          symbolSummaries={rebalanceDraft.symbolSummaries}
          symbolOrder={rebalanceDraft.symbolOrder}
          holdings={rebalanceDraft.holdings}
          onQuantityDelta={changeRebalanceQuantity}
          onAddExisting={addExistingRebalanceHolding}
          onAddNew={() => setRebalanceAddVisible(true)}
          onReset={resetRebalance}
          onSave={openRebalanceDiff}
          saveDisabled={isRebalanceCashInvalid || isRebalanceSaving}
        />
      )}

      {displayData && sectorSummaries.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionTitle}>股票占比</div>
          {sectorSummaries.map((sector) => (
            <div key={sector.sector} className={styles.sectorGroup}>
              <div className={styles.sectorHeader}>
                <div>
                  <div className={styles.sectorName}>{sector.sector}</div>
                  <div className={styles.itemMeta}>{sector.symbolCount} 只 · {formatPercent(sector.percent)}</div>
                </div>
                <div className={styles.symbolValue}>{formatMoney(sector.marketValue)}</div>
              </div>
              <div className={styles.barTrack}>
                <span style={{ width: `${Math.min(sector.percent * 100, 100)}%` }} />
              </div>
              <List className={styles.sectorList}>
                {sector.symbols.map((summary) => (
                  <List.Item key={summary.symbol} onClick={isSnapshotView || isRebalanceMode ? undefined : () => openSymbolModal(summary)} clickable={!isSnapshotView && !isRebalanceMode} arrow={false}>
                    <div className={styles.symbolRow}>
                      <div className={styles.symbolMain}>
                        <span>{summary.symbol}</span>
                        <strong>{summary.name}</strong>
                      </div>
                      <div className={styles.symbolValue}>{formatMoney(summary.marketValue)}</div>
                    </div>
                    <div className={styles.itemMeta}>
                      {formatStockQuantity(summary.quantity)} 股 · {formatPercent(summary.percent)}
                    </div>
                    <StockMetricLines summary={summary} />
                    <div className={styles.barTrack}>
                      <span style={{ width: `${Math.min(summary.percent * 100, 100)}%` }} />
                    </div>
                  </List.Item>
                ))}
              </List>
            </div>
          ))}
        </section>
      )}

      </PullToRefresh>

      <CashModal
        visible={cashModalVisible}
        amount={cashAmount}
        onClose={() => setCashModalVisible(false)}
        onSave={saveCash}
      />

      <SymbolModal
        key={selectedSymbol?.symbol ?? 'symbol'}
        visible={symbolModalVisible}
        summary={selectedSymbol}
        holdings={selectedSymbolHoldings}
        dividendEvents={dividendEvents}
        dividendLoading={dividendLoading}
        onClose={() => setSymbolModalVisible(false)}
        onSave={saveSymbol}
        onDeleteHolding={deleteHolding}
        onToggleDividendEvent={toggleDividendEvent}
      />

      <RebalanceAddHoldingModal
        key={`rebalance-add-${rebalanceAddVisible ? 'open' : 'closed'}`}
        visible={rebalanceAddVisible}
        accounts={accounts}
        accountOptions={accountOptions}
        onClose={() => setRebalanceAddVisible(false)}
        onSave={addNewRebalanceHolding}
      />

      <Modal
        visible={Boolean(rebalanceDiff)}
        title="确认调仓差异"
        closeOnMaskClick
        showCloseButton
        onClose={() => setRebalanceDiff(null)}
        content={
          rebalanceDiff && (
            <div className={styles.rebalanceDiffModal}>
              <div className={styles.rebalanceCashDiff}>
                <span>现金</span>
                <strong>{formatMoney(rebalanceDiff.cashFrom)} → {formatMoney(rebalanceDiff.cashTo)}</strong>
                <em>{rebalanceDiff.cashDelta >= 0 ? '+' : ''}{formatMoney(rebalanceDiff.cashDelta)}</em>
              </div>
              <div className={styles.rebalanceDiffList}>
                {rebalanceDiff.items.map((item) => (
                  <div key={item.key} className={styles.rebalanceDiffItem}>
                    <div>
                      <strong>{item.accountName} · {item.symbol} {item.name}</strong>
                      <span>
                        {formatStockQuantity(item.fromQuantity)} → {formatStockQuantity(item.toQuantity)} 股
                        {item.type === 'create' ? ' · 新增' : item.type === 'delete' ? ' · 清仓' : ''}
                      </span>
                    </div>
                    <em>{item.cashImpact >= 0 ? '+' : ''}{formatMoney(item.cashImpact)}</em>
                  </div>
                ))}
              </div>
              <div className={styles.rebalanceDiffActions}>
                <Button block fill="outline" disabled={isRebalanceSaving} onClick={() => setRebalanceDiff(null)}>返回修改</Button>
                <Button block color="primary" loading={isRebalanceSaving} onClick={saveRebalance}>确认保存</Button>
              </div>
            </div>
          )
        }
      />

      <Modal
        visible={Boolean(snapshotConflict)}
        title="本月已有快照"
        closeOnMaskClick
        showCloseButton
        onClose={() => setSnapshotConflict(null)}
        content={
          <div className={styles.snapshotConflict}>
            <p>
              本月已经保存 {snapshotConflict?.existingSnapshotCount ?? 0} 条快照。
              {snapshotConflict?.latestSnapshot ? ` 最近一次是 ${formatDate(snapshotConflict.latestSnapshot.snapshotAt)}。` : ''}
            </p>
            <div className={styles.snapshotConflictActions}>
              <Button block fill="outline" onClick={() => setSnapshotConflict(null)}>放弃</Button>
              <Button block color="danger" fill="outline" loading={isSnapshotSaving} onClick={() => saveSnapshot('replace')}>覆盖</Button>
              <Button block color="primary" loading={isSnapshotSaving} onClick={() => saveSnapshot('append')}>追加</Button>
            </div>
          </div>
        }
      />

      <Picker
        title="切换持仓"
        columns={[snapshotOptions]}
        visible={snapshotPickerVisible}
        value={[selectedSnapshotValue]}
        onClose={() => setSnapshotPickerVisible(false)}
        onConfirm={(value) => {
          const nextValue = value[0];
          if (nextValue != null) changeSnapshot(String(nextValue));
        }}
      />

      {(isQuoteRefreshing || isSnapshotSaving) && (
        <div className={styles.refreshOverlay}>
          <div className={styles.refreshPanel}>{isSnapshotSaving ? '正在保存快照...' : '正在刷新行情...'}</div>
        </div>
      )}
    </div>
  );
}

const SummaryStat = ({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) => (
  <button type="button" className={onClick ? styles.summaryStatButton : styles.summaryStat} onClick={onClick}>
    <strong>{value}</strong>
    <span>{label}</span>
  </button>
);

const MetricHelp = ({ label, formula, align = 'end' }: { label: string; formula: string; align?: 'start' | 'end' }) => (
  <span className={[styles.metricHelpWrap, align === 'start' ? styles.metricHelpWrapStart : ''].join(' ')}>
    <button
      type="button"
      className={styles.metricHelpButton}
      aria-label={`${label}计算方式`}
      onClick={(event) => event.stopPropagation()}
    >
      ?
    </button>
    <span className={styles.metricTooltip} role="tooltip">{formula}</span>
  </span>
);

const StockMetricLines = ({ summary }: { summary: IStockPortfolioSymbolSummary }) => (
  <>
    <div className={styles.metricLine}>
      <span className={styles.metricTagValue}>扣非 PE: <strong>{formatOptionalNumber(summary.deductedPe)}</strong>(静)</span>
      <span className={styles.metricTagTtm}><strong>{formatOptionalNumber(summary.deductedPeTtm)}</strong>(TTM)</span>
      <span className={styles.metricTagAsset}>PB <strong>{formatOptionalNumber(summary.pb)}</strong></span>
    </div>
    <div className={styles.metricLine}>
      <span className={styles.metricTagQuality}>扣非 ROE: <strong>{formatOptionalPercent(summary.deductedRoeTtm)}</strong>(TTM)</span>
      <span className={styles.metricTagDividend}>股息率: <strong>{formatOptionalPercent(summary.normalizedDividendYield)}</strong></span>
    </div>
    <div className={styles.metricLine}>
      <span className={styles.metricTagQuality}>含金量<MetricHelp label="含金量" formula="经营现金流TTM / 扣非净利润TTM" align="start" />: <strong>{formatOptionalNumber(summary.operatingCashFlowToDeductedNetProfit)}</strong>(TTM)</span>
      <span className={styles.metricTagDividend}>分红覆盖<MetricHelp label="分红覆盖" formula="自由现金流TTM / 常态分红" />: <strong>{formatOptionalNumber(summary.fcfDividendCoverage)}</strong></span>
    </div>
  </>
);

const CashModal = ({
  visible,
  amount,
  onClose,
  onSave,
}: {
  visible: boolean;
  amount: number;
  onClose: () => void;
  onSave: (values: CashFormValues) => Promise<void>;
}) => (
  <Modal
    visible={visible}
    title="修改现金"
    closeOnMaskClick
    showCloseButton
    onClose={onClose}
    content={
      <Form
        layout="horizontal"
        initialValues={{ amount: String(amount) }}
        footer={<Button block type="submit" color="primary">保存</Button>}
        onFinish={onSave}
      >
        <Form.Item name="amount" label="现金" rules={[{ required: true, message: '请输入现金金额' }]}> 
          <Input placeholder="人民币金额" type="number" />
        </Form.Item>
      </Form>
    }
  />
);

const RebalanceAddHoldingModal = ({
  visible,
  accounts,
  accountOptions,
  onClose,
  onSave,
}: {
  visible: boolean;
  accounts: StockAccount[];
  accountOptions: { label: string; value: string }[];
  onClose: () => void;
  onSave: (values: RebalanceAddHoldingFormValues) => Promise<void>;
}) => (
  <Modal
    visible={visible}
    title="新增调仓股票"
    closeOnMaskClick
    showCloseButton
    onClose={onClose}
    content={
      <Form
        layout="horizontal"
        initialValues={{
          accountId: accounts[0] ? [String(accounts[0].id)] : undefined,
          quantity: String(REBALANCE_QUANTITY_STEP),
        }}
        footer={<Button block type="submit" color="primary">加入草稿</Button>}
        onFinish={onSave}
      >
        <Form.Item name="accountId" label="账户" rules={[{ required: true, message: '请选择账户' }]}> 
          <Selector columns={2} options={accountOptions} />
        </Form.Item>
        <Form.Item name="symbol" label="代码" rules={[{ required: true, message: '请输入股票代码' }]}> 
          <Input placeholder="例如 600519" />
        </Form.Item>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入股票名称' }]}> 
          <Input placeholder="例如 贵州茅台" />
        </Form.Item>
        <Form.Item name="quantity" label="股数" rules={[{ required: true, message: '请输入股数' }]}> 
          <Input placeholder="例如 100" type="number" />
        </Form.Item>
        <Form.Item name="currentPrice" label="现价" rules={[{ required: true, message: '请输入现价' }]}> 
          <Input placeholder="人民币价格" type="number" />
        </Form.Item>
        <div className={styles.modalHint}>全新股票会先按 0 分红贡献预览，保存刷新后再使用服务端已有指标。</div>
      </Form>
    }
  />
);

const SymbolModal = ({
  visible,
  summary,
  holdings,
  dividendEvents,
  dividendLoading,
  onClose,
  onSave,
  onDeleteHolding,
  onToggleDividendEvent,
}: {
  visible: boolean;
  summary: IStockPortfolioSymbolSummary | null;
  holdings: StockHoldingWithAccount[];
  dividendEvents: StockDividendEventWithMarking[];
  dividendLoading: boolean;
  onClose: () => void;
  onSave: (values: SymbolFormValues) => Promise<void>;
  onDeleteHolding: (holding: StockHoldingWithAccount) => Promise<void>;
  onToggleDividendEvent: (event: StockDividendEventWithMarking, checked: boolean) => Promise<void>;
}) => (
  <Modal
    visible={visible}
    title={summary ? `${summary.symbol} ${summary.name}` : '股票持仓'}
    closeOnMaskClick
    showCloseButton
    onClose={onClose}
    content={
      summary && (
        <Form
          layout="horizontal"
          initialValues={{
            name: summary.name,
            currentPrice: holdings[0] ? String(holdings[0].currentPrice) : '',
            quantities: Object.fromEntries(holdings.map((holding) => [String(holding.id), String(holding.quantity)])),
          }}
          footer={<Button block type="submit" color="primary">保存</Button>}
          onFinish={onSave}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入股票名称' }]}> 
            <Input placeholder="股票名称" />
          </Form.Item>
          <Form.Item name="currentPrice" label="现价" rules={[{ required: true, message: '请输入当前价' }]}> 
            <Input placeholder="人民币价格" type="number" />
          </Form.Item>
          <StockMetricLines summary={summary} />
          <div className={styles.modalSectionTitle}>分红事件</div>
          {dividendLoading ? (
            <div className={styles.emptyGroup}>分红加载中</div>
          ) : dividendEvents.length > 0 ? (
            <div className={styles.dividendList}>
              {dividendEvents.map((event) => {
                const checked = Boolean(event.marking?.countTowardNormalizedDividend);
                return (
                  <button
                    key={event.id}
                    type="button"
                    className={checked ? styles.dividendItemActive : styles.dividendItem}
                    onClick={() => onToggleDividendEvent(event, !checked)}
                  >
                    <span className={styles.dividendMain}>
                      <strong>
                        {event.reportPeriod ?? '未知报告期'}
                        <span className={isDividendPlan(event) ? styles.dividendTagPlan : styles.dividendTagDone}>
                          {isDividendPlan(event) ? '预案' : '实施'}
                        </span>
                      </strong>
                      <em>{formatDividendPlan(event)}</em>
                      <em>除权除息 {formatDate(event.exDividendDate)}</em>
                    </span>
                    <span className={styles.dividendMark}>{checked ? '已计入' : '计入'}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyGroup}>暂无分红事件</div>
          )}
          <div className={styles.modalSectionTitle}>各账户股数</div>
          {holdings.map((holding) => (
            <div key={holding.id} className={styles.accountQuantityRow}>
              <Form.Item
                name={['quantities', String(holding.id)]}
                label={holding.account.name}
                rules={[{ required: true, message: '请输入股数' }]}
              >
                <Input placeholder="股数" type="number" />
              </Form.Item>
              <Button size="mini" color="danger" fill="outline" onClick={() => onDeleteHolding(holding)}>
                删除
              </Button>
            </div>
          ))}
        </Form>
      )
    }
  />
);
