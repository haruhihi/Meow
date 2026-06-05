'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, Form, Input, List, Modal, Picker, PullToRefresh, Selector, Toast } from 'antd-mobile';
import { DownOutline, FileOutline } from 'antd-mobile-icons';
import { observer } from 'mobx-react-lite';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { StockAccount } from '@prisma/client';
import { InlineLoading, LoadingState } from '@components/loading';
import {
  IStockAiReportListReq,
  IStockAiReportListRes,
  IStockPortfolioSymbolSummary,
  IStockRebalanceSaveReq,
  IStockSnapshotCreateReq,
  IStockSnapshotCreateRes,
} from '@dtos/meow';
import { post } from '@libs/fetch';
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

type ValuationTableModalState = {
  symbol: string;
  name: string;
  reportDate?: string;
  reportTitle?: string;
  markdown?: string | null;
  loading: boolean;
  error?: string | null;
};

const STOCK_UI_SETTINGS_KEY = 'meow:stocks:ui-settings';
const EMPTY_SYMBOLS: string[] = [];
const SYMBOL_DOUBLE_CLICK_INTERVAL = 320;

const formatPercent = (value: number) => `${(value * 100).toFixed(value > 0 && value < 0.01 ? 2 : 1)}%`;
const formatOptionalNumber = (value?: number | null) => {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.1) return value.toFixed(3);
  return value.toFixed(1);
};
const formatOptionalPercent = (value?: number | null) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`);
const formatSignedPercent = (value?: number | null) => (value == null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`);
const formatOptionalMoney = (value?: number | null) => (value == null ? '—' : formatMoney(value));
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

const extractPriceDividendTable = (content: string) => {
  const sectionHeading = content.match(/^##\s*3\.\s*价格和反推股息率.*$/m);
  if (!sectionHeading || sectionHeading.index == null) return null;
  const sectionBody = content.slice(sectionHeading.index + sectionHeading[0].length);
  const nextSectionIndex = sectionBody.search(/\n##\s+\d+\./);
  const section = nextSectionIndex >= 0 ? sectionBody.slice(0, nextSectionIndex) : sectionBody;
  const lines = section.split('\n');
  const tableStart = lines.findIndex((line) => line.trim().startsWith('|'));
  if (tableStart < 0) return null;
  let tableEnd = tableStart;
  while (tableEnd < lines.length && lines[tableEnd].trim().startsWith('|')) tableEnd += 1;
  const table = lines.slice(tableStart, tableEnd).join('\n').trim();
  return table || null;
};

const readPeTtm = (summary: IStockPortfolioSymbolSummary) => {
  if (!summary.totalShares || summary.totalShares <= 0 || !summary.netProfitTtm || summary.netProfitTtm <= 0) return null;
  return summary.currentPrice * summary.totalShares / summary.netProfitTtm;
};

const StocksPage = observer(function StocksPage() {
  const router = useRouter();
  const [cashModalVisible, setCashModalVisible] = useState(false);
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
  const [showWatchedSymbols, setShowWatchedSymbols] = useState(true);
  const [showHiddenStockItems, setShowHiddenStockItems] = useState(false);
  const [expandAllSymbols, setExpandAllSymbols] = useState(false);
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(() => new Set());
  const [hiddenSymbols, setHiddenSymbols] = useState<Set<string>>(() => new Set());
  const [valuationTableModal, setValuationTableModal] = useState<ValuationTableModalState | null>(null);
  const [stockUiHydrated, setStockUiHydrated] = useState(false);
  const pendingSymbolNavigationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSymbolClickRef = useRef<{ symbol: string; time: number } | null>(null);
  const valuationTableRequestRef = useRef(0);
  const { data, loading: portfolioLoading, reQuery, refreshQuotes, updateCash, saveRebalance: saveStockRebalance } = useStockPortfolio();
  const { snapshots, reQuery: reQuerySnapshots, createSnapshot } = useStockSnapshots(0, 120, { enabled: snapshotPickerVisible });
  const { snapshot: selectedSnapshot, loading: snapshotLoading, reQuery: reQuerySnapshot } = useStockSnapshotDetail(selectedSnapshotId);

  const isSnapshotView = selectedSnapshotId != null;
  const activeData = isSnapshotView ? selectedSnapshot?.portfolio ?? null : data;
  const displayData = isRebalanceMode && rebalanceDraft ? rebalanceDraft : activeData;
  const portfolioHiddenSymbols = data?.hiddenSymbols ?? EMPTY_SYMBOLS;
  const accounts = displayData?.accounts ?? [];
  const symbolSummaries = displayData?.symbolSummaries ?? [];
  const activeSymbolSummaries = useMemo(
    () => symbolSummaries.filter((summary) => !hiddenSymbols.has(summary.symbol)),
    [hiddenSymbols, symbolSummaries]
  );
  const totalMarketValue = activeSymbolSummaries.reduce((sum, summary) => sum + summary.marketValue, 0);
  const cashAmount = displayData?.cashAmount ?? 0;
  const totalAssetValue = totalMarketValue + cashAmount;
  const positionTotalValue = includeCashInPosition ? totalAssetValue : totalMarketValue;
  const isInitialLoading = !displayData && (isSnapshotView ? snapshotLoading : portfolioLoading);
  const expectedDividend = calculateExpectedDividend(activeSymbolSummaries);
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
        marketValue: sector.symbols
          .filter((summary) => !hiddenSymbols.has(summary.symbol))
          .reduce((sum, summary) => sum + summary.marketValue, 0),
        percent: percentOf(sector.symbols
          .filter((summary) => !hiddenSymbols.has(summary.symbol))
          .reduce((sum, summary) => sum + summary.marketValue, 0), positionTotalValue),
        symbols: sector.symbols.map((summary) => ({
          ...summary,
          percent: hiddenSymbols.has(summary.symbol) ? 0 : percentOf(summary.marketValue, positionTotalValue),
        })),
      })),
    [displayData?.sectorSummaries, hiddenSymbols, positionTotalValue]
  );
  const visibleSectorSummaries = useMemo(
    () => sectorSummaries
      .map((sector) => {
        const symbols = showWatchedSymbols
          ? sector.symbols
          : sector.symbols.filter((summary) => summary.holdingCount > 0 || summary.quantity > 0 || summary.marketValue > 0);
        const shownSymbols = symbols.filter((summary) => !hiddenSymbols.has(summary.symbol));
        return { ...sector, symbols: shownSymbols, symbolCount: shownSymbols.length };
      })
      .filter((sector) => sector.symbols.length > 0),
    [hiddenSymbols, sectorSummaries, showWatchedSymbols]
  );
  const hiddenSymbolSummaries = useMemo(
    () => sectorSummaries.flatMap((sector) => {
      const symbols = showWatchedSymbols
        ? sector.symbols
        : sector.symbols.filter((summary) => summary.holdingCount > 0 || summary.quantity > 0 || summary.marketValue > 0);
      return symbols.filter((summary) => hiddenSymbols.has(summary.symbol));
    }),
    [hiddenSymbols, sectorSummaries, showWatchedSymbols]
  );
  const hiddenMarketValue = hiddenSymbolSummaries.reduce((sum, summary) => sum + summary.marketValue, 0);
  const visibleSymbols = useMemo(
    () => [
      ...visibleSectorSummaries.flatMap((sector) => sector.symbols.map((summary) => summary.symbol)),
      ...(showHiddenStockItems ? hiddenSymbolSummaries.map((summary) => summary.symbol) : []),
    ],
    [hiddenSymbolSummaries, showHiddenStockItems, visibleSectorSummaries]
  );

  useEffect(() => {
    setHiddenSymbols(new Set(portfolioHiddenSymbols));
  }, [portfolioHiddenSymbols]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STOCK_UI_SETTINGS_KEY);
      if (raw) {
        const settings = JSON.parse(raw) as {
          includeCashInPosition?: boolean;
          showWatchedSymbols?: boolean;
          expandAllSymbols?: boolean;
          expandedSymbols?: string[];
        };
        if (typeof settings.includeCashInPosition === 'boolean') setIncludeCashInPosition(settings.includeCashInPosition);
        if (typeof settings.showWatchedSymbols === 'boolean') setShowWatchedSymbols(settings.showWatchedSymbols);
        if (typeof settings.expandAllSymbols === 'boolean') setExpandAllSymbols(settings.expandAllSymbols);
        if (Array.isArray(settings.expandedSymbols)) setExpandedSymbols(new Set(settings.expandedSymbols));
      }
    } catch {
      // Ignore invalid persisted UI state.
    } finally {
      setStockUiHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!stockUiHydrated) return;
    try {
      window.localStorage.setItem(STOCK_UI_SETTINGS_KEY, JSON.stringify({
        includeCashInPosition,
        showWatchedSymbols,
        expandAllSymbols,
        expandedSymbols: [...expandedSymbols],
      }));
    } catch {
      // Ignore unavailable localStorage.
    }
  }, [expandAllSymbols, expandedSymbols, includeCashInPosition, showWatchedSymbols, stockUiHydrated]);

  useEffect(() => {
    if (!expandAllSymbols || visibleSymbols.length === 0) return;
    setExpandedSymbols(new Set(visibleSymbols));
  }, [expandAllSymbols, visibleSymbols]);

  useEffect(() => () => {
    if (pendingSymbolNavigationRef.current) clearTimeout(pendingSymbolNavigationRef.current);
  }, []);

  useEffect(() => {
    if (!isSnapshotView) return;
    setCashModalVisible(false);
    setIsRebalanceMode(false);
    setRebalanceDraft(null);
    setRebalanceDiff(null);
    setRebalanceAddVisible(false);
  }, [isSnapshotView]);

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
      const res = await saveStockRebalance(payload);
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
      await updateCash({
        amount: Number(values.amount),
      });
      Toast.show({ content: '现金已保存' });
      setCashModalVisible(false);
    } catch (error) {
      Toast.show({ content: `保存失败: ${(error as any)?.result ?? error}` });
    }
  };

  const refreshWithQuotes = async () => {
    if (isQuoteRefreshing) return;
    setIsQuoteRefreshing(true);
    try {
      const res = await refreshQuotes();
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
      const res = await createSnapshot({
        duplicatePolicy,
      });
      if (res.status === 'exists') {
        setSnapshotConflict(res);
        return;
      }
      if (res.status === 'created' && res.snapshot) {
        Toast.show({ content: `快照已保存：${formatDate(res.snapshot.snapshotAt)}` });
      }
    } catch (error) {
      Toast.show({ content: `快照保存失败: ${(error as any)?.result ?? error}` });
    } finally {
      setIsSnapshotSaving(false);
    }
  };

  const openSymbolPage = (summary: IStockPortfolioSymbolSummary) => {
    router.push(`/meow/stocks/${encodeURIComponent(summary.symbol)}`);
  };

  const openSymbolLatestReportPage = (summary: IStockPortfolioSymbolSummary) => {
    router.push(`/meow/stocks/${encodeURIComponent(summary.symbol)}/ai-report`);
  };

  const clearPendingSymbolNavigation = () => {
    if (!pendingSymbolNavigationRef.current) return;
    clearTimeout(pendingSymbolNavigationRef.current);
    pendingSymbolNavigationRef.current = null;
  };

  const toggleSymbolExpanded = (symbol: string) => {
    if (expandAllSymbols && expandedSymbols.has(symbol)) setExpandAllSymbols(false);
    setExpandedSymbols((current) => {
      const next = new Set(current);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  const changeExpandAllSymbols = (checked: boolean) => {
    setExpandAllSymbols(checked);
    setExpandedSymbols(checked ? new Set(visibleSymbols) : new Set());
  };

  const openOrExpandSymbol = (summary: IStockPortfolioSymbolSummary) => {
    const isExpanded = expandedSymbols.has(summary.symbol);
    if (!isExpanded) {
      toggleSymbolExpanded(summary.symbol);
      return;
    }
    if (!isSnapshotView && !isRebalanceMode) {
      clearPendingSymbolNavigation();
      pendingSymbolNavigationRef.current = setTimeout(() => {
        pendingSymbolNavigationRef.current = null;
        openSymbolPage(summary);
      }, SYMBOL_DOUBLE_CLICK_INTERVAL);
    }
  };

  const openSymbolLatestReport = (summary: IStockPortfolioSymbolSummary) => {
    if (isSnapshotView || isRebalanceMode) return;
    clearPendingSymbolNavigation();
    openSymbolLatestReportPage(summary);
  };

  const openValuationTable = async (summary: IStockPortfolioSymbolSummary) => {
    clearPendingSymbolNavigation();
    const requestId = valuationTableRequestRef.current + 1;
    valuationTableRequestRef.current = requestId;
    setValuationTableModal({ symbol: summary.symbol, name: summary.name, loading: true });
    try {
      const res = await post<IStockAiReportListReq, IStockAiReportListRes>('/api/stock/ai-report/list', { symbol: summary.symbol });
      if (valuationTableRequestRef.current !== requestId) return;
      const latestReport = res.reports[0] ?? null;
      if (!latestReport) {
        setValuationTableModal({ symbol: summary.symbol, name: summary.name, loading: false, markdown: null, error: '暂无该股票研报' });
        return;
      }
      const markdown = extractPriceDividendTable(latestReport.content);
      setValuationTableModal({
        symbol: summary.symbol,
        name: summary.name,
        reportDate: latestReport.reportDate,
        reportTitle: latestReport.title,
        markdown,
        loading: false,
        error: markdown ? null : '最新研报里没有找到价格和反推股息率表格',
      });
    } catch (error) {
      if (valuationTableRequestRef.current !== requestId) return;
      setValuationTableModal({ symbol: summary.symbol, name: summary.name, loading: false, markdown: null, error: `加载失败: ${(error as any)?.result ?? error}` });
    }
  };

  const closeValuationTable = () => {
    valuationTableRequestRef.current += 1;
    setValuationTableModal(null);
  };

  const clickSymbolCard = (summary: IStockPortfolioSymbolSummary, clickCount: number) => {
    const now = Date.now();
    const lastClick = lastSymbolClickRef.current;
    const isDoubleClick = clickCount > 1 || Boolean(lastClick && lastClick.symbol === summary.symbol && now - lastClick.time <= SYMBOL_DOUBLE_CLICK_INTERVAL);
    lastSymbolClickRef.current = { symbol: summary.symbol, time: now };

    if (isDoubleClick) {
      openSymbolLatestReport(summary);
      return;
    }

    openOrExpandSymbol(summary);
  };

  return (
    <div className={styles.page}>
      <PullToRefresh onRefresh={refreshActive}>
      <section className={styles.summaryCard}>
        <div className={styles.summaryHeader}>
          <div className={styles.summaryActions}>
            <button type="button" className={styles.quoteButton} onClick={() => setSnapshotPickerVisible(true)}>
              {selectedSnapshotId != null && !selectedSnapshot ? <InlineLoading label="快照加载中" /> : selectedSnapshotLabel}
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
                    存快照
                  </button>
                  <button type="button" className={styles.quoteButton} disabled={isQuoteRefreshing} onClick={refreshWithQuotes}>
                    刷新数据
                  </button>
                  <button type="button" className={styles.quoteButton} onClick={() => router.push('/meow/stocks/magic-formula')}>
                    神奇公式
                  </button>
                </>
              )
            )}
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
          <SummaryStat label="持仓" value={`${activeSymbolSummaries.length}`} />
          <SummaryStat label={isRebalanceMode ? '预期分红预估' : '预期分红'} value={formatMoney(expectedDividend)} />
          <SummaryStat label={isRebalanceMode ? '股息率预估' : '综合股息率'} value={formatPercent(portfolioDividendYield)} />
        </div>
      </section>

      {isInitialLoading && (
        <LoadingState className={styles.portfolioLoadingBlock} label={isSnapshotView ? '快照加载中' : '正在加载持仓'} />
      )}

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

      {displayData && (visibleSectorSummaries.length > 0 || hiddenSymbolSummaries.length > 0) && (
        <section className={styles.section}>
          <div className={styles.sectionTitleRow}>
            <div className={styles.sectionTitle}>股票占比</div>
            <div className={styles.stockToggles}>
              <button type="button" className={includeCashInPosition ? styles.stockToggleButtonActive : styles.stockToggleButton} aria-pressed={includeCashInPosition} onClick={() => setIncludeCashInPosition((value) => !value)}>
                计现金
              </button>
              <button type="button" className={showWatchedSymbols ? styles.stockToggleButtonActive : styles.stockToggleButton} aria-pressed={showWatchedSymbols} onClick={() => setShowWatchedSymbols((value) => !value)}>
                显示关注
              </button>
              <button type="button" className={expandAllSymbols ? styles.stockToggleButtonActive : styles.stockToggleButton} aria-pressed={expandAllSymbols} onClick={() => changeExpandAllSymbols(!expandAllSymbols)}>
                全部展开
              </button>
            </div>
          </div>
          {visibleSectorSummaries.map((sector) => (
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
                {sector.symbols.map((summary) => {
                  const isExpanded = expandedSymbols.has(summary.symbol);
                  const itemClassName = isExpanded ? styles.symbolItemExpanded : styles.symbolItem;
                  return (
                  <List.Item
                    key={summary.symbol}
                    className={itemClassName}
                    onClick={(event) => clickSymbolCard(summary, event.detail)}
                    clickable={!isExpanded || (!isSnapshotView && !isRebalanceMode)}
                    arrow={false}
                  >
                    <div className={styles.symbolCardContent}>
                      <div className={styles.symbolRow}>
                        <div className={styles.symbolMain}>
                          <strong>{summary.name}</strong>
                          <span className={styles.symbolPercent}>{formatPercent(summary.percent)}</span>
                        </div>
                        <div className={styles.symbolRight}>
                          <div className={styles.symbolValue}>{formatMoney(summary.marketValue)}</div>
                          <button
                            type="button"
                            className={styles.valuationTableButton}
                            aria-label={`查看${summary.name}价格和反推股息率表格`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void openValuationTable(summary);
                            }}
                          >
                            <span className={styles.buttonText}><FileOutline /> 估值表</span>
                          </button>
                          <button
                            type="button"
                            className={isExpanded ? styles.expandButtonOpen : styles.expandButton}
                            aria-label={isExpanded ? '收起股票指标' : '展开股票指标'}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSymbolExpanded(summary.symbol);
                            }}
                          >
                            <DownOutline />
                          </button>
                        </div>
                      </div>
                      <StockMetricSummary summary={summary} />
                      <div className={isExpanded ? styles.metricDetailsOpen : styles.metricDetails}>
                        <div className={styles.metricDetailsInner}>
                          <StockMetricDetails summary={summary} />
                        </div>
                      </div>
                      <div className={styles.barTrack}>
                        <span style={{ width: `${Math.min(summary.percent * 100, 100)}%` }} />
                      </div>
                    </div>
                  </List.Item>
                  );
                })}
              </List>
            </div>
          ))}

          {hiddenSymbolSummaries.length > 0 && (
            <div className={styles.hiddenItemsBlock}>
              <button
                type="button"
                className={styles.hiddenItemsToggle}
                aria-expanded={showHiddenStockItems}
                onClick={() => setShowHiddenStockItems((value) => !value)}
              >
                <DownOutline className={showHiddenStockItems ? styles.hiddenItemsToggleIconOpen : styles.hiddenItemsToggleIcon} />
                <span>{showHiddenStockItems ? '收起隐藏项目' : `显示隐藏项目 ${hiddenSymbolSummaries.length}`}</span>
              </button>
              {showHiddenStockItems && (
                <div className={`${styles.sectorGroup} ${styles.sectorGroupHidden} ${styles.hiddenItemsGroup}`}>
                  <div className={styles.sectorHeader}>
                    <div>
                      <div className={styles.sectorName}>隐藏项目</div>
                      <div className={styles.itemMeta}>{hiddenSymbolSummaries.length} 只 · 不计入占比</div>
                    </div>
                    <div className={styles.symbolValue}>{formatMoney(hiddenMarketValue)}</div>
                  </div>
                  <List className={styles.sectorList}>
                    {hiddenSymbolSummaries.map((summary) => {
                      const isExpanded = expandedSymbols.has(summary.symbol);
                      const itemClassName = [isExpanded ? styles.symbolItemExpanded : styles.symbolItem, styles.symbolItemHidden].join(' ');
                      return (
                        <List.Item
                          key={summary.symbol}
                          className={itemClassName}
                          onClick={(event) => clickSymbolCard(summary, event.detail)}
                          clickable={!isExpanded || (!isSnapshotView && !isRebalanceMode)}
                          arrow={false}
                        >
                          <div className={styles.symbolCardContent}>
                            <div className={styles.symbolRow}>
                              <div className={styles.symbolMain}>
                                <strong>{summary.name}</strong>
                                <span className={styles.symbolPercent}>{formatPercent(summary.percent)}</span>
                              </div>
                              <div className={styles.symbolRight}>
                                <div className={styles.symbolValue}>{formatMoney(summary.marketValue)}</div>
                                <button
                                  type="button"
                                  className={styles.valuationTableButton}
                                  aria-label={`查看${summary.name}价格和反推股息率表格`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void openValuationTable(summary);
                                  }}
                                >
                                  <span className={styles.buttonText}><FileOutline /> 估值表</span>
                                </button>
                                <button
                                  type="button"
                                  className={isExpanded ? styles.expandButtonOpen : styles.expandButton}
                                  aria-label={isExpanded ? '收起股票指标' : '展开股票指标'}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleSymbolExpanded(summary.symbol);
                                  }}
                                >
                                  <DownOutline />
                                </button>
                              </div>
                            </div>
                            <StockMetricSummary summary={summary} />
                            <div className={isExpanded ? styles.metricDetailsOpen : styles.metricDetails}>
                              <div className={styles.metricDetailsInner}>
                                <StockMetricDetails summary={summary} />
                              </div>
                            </div>
                            <div className={styles.barTrack}>
                              <span style={{ width: `${Math.min(summary.percent * 100, 100)}%` }} />
                            </div>
                          </div>
                        </List.Item>
                      );
                    })}
                  </List>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      </PullToRefresh>

      <CashModal
        visible={cashModalVisible}
        amount={cashAmount}
        onClose={() => setCashModalVisible(false)}
        onSave={saveCash}
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
        visible={Boolean(valuationTableModal)}
        title={valuationTableModal ? `${valuationTableModal.name} 估值表` : '估值表'}
        closeOnMaskClick
        showCloseButton
        onClose={closeValuationTable}
        content={
          valuationTableModal && (
            <div className={styles.valuationTableModal}>
              <div className={styles.valuationTableMeta}>
                <strong>{valuationTableModal.symbol}</strong>
                {valuationTableModal.reportDate && <span>{formatDate(valuationTableModal.reportDate)}</span>}
                {valuationTableModal.reportTitle && <em>{valuationTableModal.reportTitle}</em>}
                <em>直接截取自最新研报第 3 节，未单独计算</em>
              </div>
              {valuationTableModal.loading ? (
                <LoadingState label="估值表加载中" />
              ) : valuationTableModal.markdown ? (
                <div className={styles.valuationTableContent}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{valuationTableModal.markdown}</ReactMarkdown>
                </div>
              ) : (
                <div className={styles.emptyGroup}>{valuationTableModal.error ?? '暂无估值表'}</div>
              )}
            </div>
          )
        }
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
          <div className={styles.refreshPanel}><InlineLoading label={isSnapshotSaving ? '正在保存快照' : '正在刷新行情'} /></div>
        </div>
      )}
    </div>
  );
});

export default StocksPage;

const SummaryStat = ({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) => (
  <button type="button" className={onClick ? styles.summaryStatButton : styles.summaryStat} onClick={onClick}>
    <strong>{value}</strong>
    <span>{label}</span>
  </button>
);

const StockMetricSummary = ({ summary }: { summary: IStockPortfolioSymbolSummary }) => (
  <div className={styles.metricLineCompact}>
    <span className={styles.metricTagTtm}>PE扣T <strong>{formatOptionalNumber(summary.deductedPeTtm)}</strong></span>
    <span className={styles.metricTagDividend}>股息率 <strong>{formatOptionalPercent(summary.normalizedDividendYield)}</strong></span>
    <span className={styles.metricTagValue}>PEG扣 <strong>{formatOptionalNumber(summary.deductedPeg)}</strong></span>
    <span className={styles.metricTagQuality}>CAGR{summary.deductedNetProfitCagrYears ?? 5} <strong>{formatOptionalPercent(summary.deductedNetProfitCagr5)}</strong></span>
  </div>
);

const StockMetricDetails = ({ summary }: { summary: IStockPortfolioSymbolSummary }) => (
  <div className={styles.metricGridDetails}>
    <div className={styles.metricGridRow}>
      <span className={styles.metricTagValue}>PE TTM <strong>{formatOptionalNumber(readPeTtm(summary))}</strong></span>
      <span className={styles.metricTagAsset}>PB <strong>{formatOptionalNumber(summary.pb)}</strong></span>
      <span className={styles.metricTagQuality}>ROE扣T <strong>{formatOptionalPercent(summary.deductedRoeTtm)}</strong></span>
    </div>
    <div className={styles.metricGridRow}>
      <span className={styles.metricTagQuality}>
        含金量: <strong>{formatOptionalNumber(summary.operatingCashFlowToDeductedNetProfit)}</strong>(TTM)
      </span>
      <span className={styles.metricTagDividend}>
        分红覆盖: <strong>{formatOptionalNumber(summary.fcfDividendCoverage)}</strong>
      </span>
      <span className={styles.metricTagAsset}>商誉/净资产: <strong>{formatOptionalPercent(summary.goodwillToNetAsset)}</strong></span>
    </div>
    <div className={styles.metricGridRow}>
      <span className={styles.metricTagValue}>PE分位 <strong>{formatOptionalPercent(summary.peValuation?.currentPercentile)}</strong></span>
      <span className={styles.metricTagValue}>PE中位价 <strong>{formatOptionalMoney(summary.peValuation?.targets.find((target) => target.percentile === 50)?.price)}</strong></span>
      <span className={styles.metricTagQuality}>中位空间 <strong>{formatSignedPercent(summary.peValuation?.targets.find((target) => target.percentile === 50)?.upside)}</strong></span>
    </div>
  </div>
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

