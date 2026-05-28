'use client';

import { useMemo, useState } from 'react';
import { Button, Dialog, Empty, Form, Input, List, Modal, NavBar, PullToRefresh, Selector, Switch, Toast } from 'antd-mobile';
import { AddCircleOutline, PayCircleOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import type { StockAccount } from '@prisma/client';
import { post } from '@libs/fetch';
import {
  IStockAccountCreateReq,
  IStockAccountCreateRes,
  IStockAccountDeleteReq,
  IStockAccountUpdateReq,
  IStockAccountUpdateRes,
  IStockCashUpdateReq,
  IStockCashUpdateRes,
  IStockDividendListReq,
  IStockDividendListRes,
  IStockDividendMarkingUpdateReq,
  IStockDividendMarkingUpdateRes,
  IStockHoldingCreateReq,
  IStockHoldingCreateRes,
  IStockHoldingDeleteReq,
  IStockHoldingUpdateReq,
  IStockHoldingUpdateRes,
  IStockPortfolioSymbolSummary,
  IStockSnapshotCreateReq,
  IStockSnapshotCreateRes,
  StockDividendEventWithMarking,
  StockHoldingWithAccount,
} from '@dtos/meow';
import { formatMoney } from '@styles/theme';
import { useStockPortfolio } from '@utils/stock';
import styles from './stocks.module.scss';

type AccountFormValues = {
  name: string;
};

type HoldingFormValues = {
  accountId: string[];
  symbol: string;
  name: string;
  quantity: string;
  currentPrice: string;
};

type SymbolFormValues = {
  name: string;
  currentPrice: string;
  quantities: Record<string, string>;
};

type CashFormValues = {
  amount: string;
};

const formatQuantity = (value: number) => Number(value.toFixed(4)).toString();
const formatPercent = (value: number) => `${(value * 100).toFixed(value > 0 && value < 0.01 ? 2 : 1)}%`;
const formatOptionalNumber = (value?: number | null) => (value == null ? '—' : value.toFixed(1));
const formatOptionalPercent = (value?: number | null) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`);
const marketValueOf = (holding: { quantity: number; currentPrice: number }) => holding.quantity * holding.currentPrice;
const percentOf = (value: number, total: number) => (total > 0 ? value / total : 0);
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
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [cashModalVisible, setCashModalVisible] = useState(false);
  const [holdingModalVisible, setHoldingModalVisible] = useState(false);
  const [symbolModalVisible, setSymbolModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<StockAccount | null>(null);
  const [editingHolding, setEditingHolding] = useState<StockHoldingWithAccount | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<IStockPortfolioSymbolSummary | null>(null);
  const [dividendEvents, setDividendEvents] = useState<StockDividendEventWithMarking[]>([]);
  const [dividendLoading, setDividendLoading] = useState(false);
  const [defaultAccountId, setDefaultAccountId] = useState<number | null>(null);
  const [showAccountAllocation, setShowAccountAllocation] = useState(false);
  const [showAccountDetail, setShowAccountDetail] = useState(false);
  const [includeCashInPosition, setIncludeCashInPosition] = useState(true);
  const [quoteFetchedAt, setQuoteFetchedAt] = useState<string | null>(null);
  const [isQuoteRefreshing, setIsQuoteRefreshing] = useState(false);
  const [isSnapshotSaving, setIsSnapshotSaving] = useState(false);
  const [snapshotConflict, setSnapshotConflict] = useState<IStockSnapshotCreateRes | null>(null);
  const { data, loading, reQuery, refreshQuotes } = useStockPortfolio(refreshKey);

  const accounts = data?.accounts ?? [];
  const holdings = data?.holdings ?? [];
  const symbolSummaries = data?.symbolSummaries ?? [];
  const totalMarketValue = data?.totalMarketValue ?? 0;
  const totalAssetValue = data?.totalAssetValue ?? totalMarketValue;
  const cashAmount = data?.cashAmount ?? 0;
  const positionTotalValue = includeCashInPosition ? totalAssetValue : totalMarketValue;
  const expectedDividend = symbolSummaries.reduce(
    (sum, summary) => sum + summary.marketValue * (summary.normalizedDividendYield ?? 0),
    0
  );
  const portfolioDividendYield = totalMarketValue > 0 ? expectedDividend / totalMarketValue : 0;
  const accountOptions = accounts.map((account) => ({ label: account.name, value: String(account.id) }));
  const accountSummaries = useMemo(
    () =>
      (data?.accountSummaries ?? []).map((summary) => ({
        ...summary,
        percent: percentOf(summary.marketValue, positionTotalValue),
      })),
    [data?.accountSummaries, positionTotalValue]
  );
  const sectorSummaries = useMemo(
    () =>
      (data?.sectorSummaries ?? []).map((sector) => ({
        ...sector,
        percent: percentOf(sector.marketValue, positionTotalValue),
        symbols: sector.symbols.map((summary) => ({
          ...summary,
          percent: percentOf(summary.marketValue, positionTotalValue),
        })),
      })),
    [data?.sectorSummaries, positionTotalValue]
  );
  const holdingsByAccount = useMemo(
    () =>
      accounts.map((account) => ({
        account,
        holdings: holdings.filter((holding) => holding.accountId === account.id),
      })),
    [accounts, holdings]
  );
  const selectedSymbolHoldings = useMemo(
    () => holdings.filter((holding) => holding.symbol === selectedSymbol?.symbol),
    [holdings, selectedSymbol?.symbol]
  );

  const refresh = () => setRefreshKey((key) => key + 1);

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
        Toast.show({ content: `快照已保存：${formatDate(res.snapshot.snapshotAt)}` });
      }
    } catch (error) {
      Toast.show({ content: `快照保存失败: ${(error as any)?.result ?? error}` });
    } finally {
      setIsSnapshotSaving(false);
    }
  };

  const openCreateAccount = () => {
    setEditingAccount(null);
    setAccountModalVisible(true);
  };

  const openEditAccount = (account: StockAccount) => {
    setEditingAccount(account);
    setAccountModalVisible(true);
  };

  const openCreateHolding = (accountId?: number) => {
    setEditingHolding(null);
    setDefaultAccountId(accountId ?? accounts[0]?.id ?? null);
    setHoldingModalVisible(true);
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

  const saveAccount = async (values: AccountFormValues) => {
    try {
      if (editingAccount) {
        await post<IStockAccountUpdateReq, IStockAccountUpdateRes>('/api/stock/account/update', {
          id: editingAccount.id,
          name: values.name,
        });
        Toast.show({ content: '账户已保存' });
      } else {
        await post<IStockAccountCreateReq, IStockAccountCreateRes>('/api/stock/account/create', {
          name: values.name,
        });
        Toast.show({ content: '账户已创建' });
      }
      setAccountModalVisible(false);
      refresh();
    } catch (error) {
      Toast.show({ content: `保存失败: ${(error as any)?.result ?? error}` });
    }
  };

  const deleteAccount = async (account: StockAccount) => {
    const ok = await Dialog.confirm({ title: '删除账户', content: `确认删除「${account.name}」吗？账户下有持仓时会被阻止。` });
    if (!ok) return;
    try {
      await post<IStockAccountDeleteReq, { id: number }>('/api/stock/account/delete', { id: account.id });
      Toast.show({ content: '账户已删除' });
      refresh();
    } catch (error) {
      Toast.show({ content: `删除失败: ${(error as any)?.result ?? error}` });
    }
  };

  const saveHolding = async (values: HoldingFormValues) => {
    const payload = {
      accountId: Number(values.accountId?.[0]),
      symbol: values.symbol,
      name: values.name,
      quantity: Number(values.quantity),
      currentPrice: Number(values.currentPrice),
    };

    if (!payload.accountId) {
      Toast.show({ content: '请选择账户' });
      return;
    }

    try {
      if (editingHolding) {
        await post<IStockHoldingUpdateReq, IStockHoldingUpdateRes>('/api/stock/holding/update', {
          id: editingHolding.id,
          ...payload,
        });
        Toast.show({ content: '持仓已保存' });
      } else {
        await post<IStockHoldingCreateReq, IStockHoldingCreateRes>('/api/stock/holding/create', payload);
        Toast.show({ content: '持仓已创建' });
      }
      setHoldingModalVisible(false);
      refresh();
    } catch (error) {
      Toast.show({ content: `保存失败: ${(error as any)?.result ?? error}` });
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
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        股票持仓
      </NavBar>

      <PullToRefresh onRefresh={() => reQuery()}>
      <section className={styles.summaryCard}>
        <div className={styles.summaryHeader}>
          <div className={styles.summaryLabel}>总资产</div>
          <div className={styles.summaryActions}>
            <label className={styles.positionToggle}>
              <span>计现金</span>
              <Switch checked={includeCashInPosition} onChange={setIncludeCashInPosition} />
            </label>
            <button type="button" className={styles.quoteButton} onClick={() => router.push('/meow/stocks/snapshots')}>
              快照列表
            </button>
            <button type="button" className={styles.quoteButton} disabled={isSnapshotSaving} onClick={() => saveSnapshot()}>
              {isSnapshotSaving ? '保存中...' : '存快照'}
            </button>
            <button type="button" className={styles.quoteButton} disabled={isQuoteRefreshing} onClick={refreshWithQuotes}>
              {isQuoteRefreshing ? '刷新中...' : '刷新数据'}
            </button>
          </div>
        </div>
        <div className={styles.summaryValue}>{formatMoney(totalAssetValue)}</div>
        {quoteFetchedAt && <div className={styles.quoteTime}>行情 {formatQuoteTime(quoteFetchedAt)}</div>}
        <div className={styles.summaryGrid}>
          <SummaryStat label="股票" value={formatMoney(totalMarketValue)} />
          <SummaryStat label="现金" value={formatMoney(cashAmount)} onClick={() => setCashModalVisible(true)} />
          <SummaryStat label="持仓" value={`${symbolSummaries.length}`} />
          <SummaryStat label="预期分红" value={formatMoney(expectedDividend)} />
          <SummaryStat label="综合股息率" value={formatPercent(portfolioDividendYield)} />
        </div>
      </section>

      {data && sectorSummaries.length > 0 && (
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
                  <List.Item key={summary.symbol} onClick={() => openSymbolModal(summary)} clickable arrow={false}>
                    <div className={styles.symbolRow}>
                      <div className={styles.symbolMain}>
                        <span>{summary.symbol}</span>
                        <strong>{summary.name}</strong>
                      </div>
                      <div className={styles.symbolValue}>{formatMoney(summary.marketValue)}</div>
                    </div>
                    <div className={styles.itemMeta}>
                      {formatQuantity(summary.quantity)} 股 · {formatPercent(summary.percent)}
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

      <section className={styles.section}>
        <button type="button" className={styles.foldHeader} onClick={() => setShowAccountAllocation((value) => !value)}>
          <span>账户仓位</span>
          <strong>{showAccountAllocation ? '收起' : '展开'}</strong>
        </button>
        {showAccountAllocation && (
          <>
            <div className={styles.foldActions}>
              <Button size="small" color="primary" onClick={openCreateAccount}>
                <span className={styles.buttonText}><AddCircleOutline /> 新增账户</span>
              </Button>
              <Button size="small" color="primary" fill="outline" disabled={accounts.length === 0} onClick={() => openCreateHolding()}>
                <span className={styles.buttonText}><AddCircleOutline /> 新增持仓</span>
              </Button>
            </div>
            {accounts.length > 0 ? (
            <div className={styles.accountScroller}>
              {accountSummaries.map((summary) => (
                <div key={summary.accountId} className={styles.accountCard}>
                  <div className={styles.cardTopline}>
                    <span>{summary.name}</span>
                    <strong>{formatPercent(summary.percent)}</strong>
                  </div>
                  <div className={styles.cardValue}>{formatMoney(summary.marketValue)}</div>
                  <div className={styles.barTrack}>
                    <span style={{ width: `${Math.min(summary.percent * 100, 100)}%` }} />
                  </div>
                  <div className={styles.cardActions}>
                    <Button size="mini" onClick={() => openEditAccount(accounts.find((account) => account.id === summary.accountId)!)}>
                      重命名
                    </Button>
                    <Button size="mini" fill="outline" color="danger" onClick={() => deleteAccount(accounts.find((account) => account.id === summary.accountId)!)}>
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            ) : (
              <Empty style={{ padding: '32px 0' }} description={loading ? '加载中' : '还没有股票账户'} />
            )}
          </>
        )}
      </section>

      <section className={styles.section}>
        <button type="button" className={styles.foldHeader} onClick={() => setShowAccountDetail((value) => !value)}>
          <span>账户明细</span>
          <strong>{showAccountDetail ? '收起' : '展开'}</strong>
        </button>
        {showAccountDetail && (
          accounts.length === 0 ? (
            <Empty style={{ padding: '64px 0' }} description={loading ? '加载中' : '先新增一个股票账户'} />
          ) : (
            holdingsByAccount.map(({ account, holdings: accountHoldings }) => (
              <div key={account.id} className={styles.group}>
                <div className={styles.groupHeader}>
                  <div>
                    <div className={styles.groupTitle}>{account.name}</div>
                    <div className={styles.groupMeta}>{accountHoldings.length} 个持仓</div>
                  </div>
                  <Button size="mini" onClick={() => openCreateHolding(account.id)}>新增</Button>
                </div>

                {accountHoldings.length > 0 ? (
                  <List className={styles.list}>
                    {accountHoldings.map((holding) => (
                      <List.Item key={holding.id} prefix={<div className={styles.stockIcon}><PayCircleOutline /></div>}>
                        <div className={styles.itemTitle}>{holding.symbol} · {holding.name}</div>
                        <div className={styles.itemMeta}>
                          {formatQuantity(holding.quantity)} 股 × {formatMoney(holding.currentPrice)} = {formatMoney(marketValueOf(holding))}
                        </div>
                      </List.Item>
                    ))}
                  </List>
                ) : (
                  <div className={styles.emptyGroup}>这个账户还没有持仓</div>
                )}
              </div>
            ))
          )
        )}
      </section>
      </PullToRefresh>

      <AccountModal
        key={editingAccount?.id ?? 'create-account'}
        visible={accountModalVisible}
        account={editingAccount}
        onClose={() => setAccountModalVisible(false)}
        onSave={saveAccount}
      />

      <CashModal
        visible={cashModalVisible}
        amount={cashAmount}
        onClose={() => setCashModalVisible(false)}
        onSave={saveCash}
      />

      <HoldingModal
        key={editingHolding?.id ?? `create-holding-${defaultAccountId ?? accounts.length}`}
        visible={holdingModalVisible}
        holding={editingHolding}
        accounts={accounts}
        defaultAccountId={defaultAccountId}
        accountOptions={accountOptions}
        onClose={() => setHoldingModalVisible(false)}
        onSave={saveHolding}
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

const AccountModal = ({
  visible,
  account,
  onClose,
  onSave,
}: {
  visible: boolean;
  account: StockAccount | null;
  onClose: () => void;
  onSave: (values: AccountFormValues) => Promise<void>;
}) => (
  <Modal
    visible={visible}
    title={account ? '重命名账户' : '新增账户'}
    closeOnMaskClick
    showCloseButton
    onClose={onClose}
    content={
      <Form
        layout="horizontal"
        initialValues={{ name: account?.name ?? '' }}
        footer={<Button block type="submit" color="primary">保存</Button>}
        onFinish={onSave}
      >
        <Form.Item name="name" label="账户" rules={[{ required: true, message: '请输入账户名' }]}>
          <Input placeholder="例如 华泰、富途、招商" />
        </Form.Item>
      </Form>
    }
  />
);

const HoldingModal = ({
  visible,
  holding,
  accounts,
  defaultAccountId,
  accountOptions,
  onClose,
  onSave,
}: {
  visible: boolean;
  holding: StockHoldingWithAccount | null;
  accounts: StockAccount[];
  defaultAccountId: number | null;
  accountOptions: { label: string; value: string }[];
  onClose: () => void;
  onSave: (values: HoldingFormValues) => Promise<void>;
}) => (
  <Modal
    visible={visible}
    title={holding ? '编辑持仓' : '新增持仓'}
    closeOnMaskClick
    showCloseButton
    onClose={onClose}
    content={
      <Form
        layout="horizontal"
        initialValues={{
          accountId: holding
            ? [String(holding.accountId)]
            : defaultAccountId
              ? [String(defaultAccountId)]
              : accounts[0]
                ? [String(accounts[0].id)]
                : undefined,
          symbol: holding?.symbol ?? '',
          name: holding?.name ?? '',
          quantity: holding ? String(holding.quantity) : '',
          currentPrice: holding ? String(holding.currentPrice) : '',
        }}
        footer={<Button block type="submit" color="primary">保存</Button>}
        onFinish={onSave}
      >
        <Form.Item name="accountId" label="账户" rules={[{ required: true, message: '请选择账户' }]}> 
          <Selector columns={2} options={accountOptions} />
        </Form.Item>
        <Form.Item name="symbol" label="代码" rules={[{ required: true, message: '请输入股票代码' }]}> 
          <Input placeholder="例如 AAPL、00700、贵州茅台" />
        </Form.Item>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入股票名称' }]}> 
          <Input placeholder="例如 苹果、腾讯控股" />
        </Form.Item>
        <Form.Item name="quantity" label="股数" rules={[{ required: true, message: '请输入股数' }]}> 
          <Input placeholder="例如 100" type="number" />
        </Form.Item>
        <Form.Item name="currentPrice" label="现价" rules={[{ required: true, message: '请输入当前价' }]}> 
          <Input placeholder="人民币价格" type="number" />
        </Form.Item>
        <div className={styles.modalHint}>保存现价后，同一股票代码在其他账户中的现价会同步更新。</div>
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
