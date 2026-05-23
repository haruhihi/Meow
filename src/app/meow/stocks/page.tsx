'use client';

import { useMemo, useState } from 'react';
import { Button, Dialog, Empty, Form, Input, List, Modal, NavBar, Selector, Toast } from 'antd-mobile';
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
  IStockHoldingCreateReq,
  IStockHoldingCreateRes,
  IStockHoldingDeleteReq,
  IStockHoldingUpdateReq,
  IStockHoldingUpdateRes,
  IStockPortfolioSymbolSummary,
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

const formatQuantity = (value: number) => Number(value.toFixed(4)).toString();
const formatPercent = (value: number) => `${(value * 100).toFixed(value > 0 && value < 0.01 ? 2 : 1)}%`;
const marketValueOf = (holding: { quantity: number; currentPrice: number }) => holding.quantity * holding.currentPrice;

export default function StocksPage() {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [holdingModalVisible, setHoldingModalVisible] = useState(false);
  const [symbolModalVisible, setSymbolModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<StockAccount | null>(null);
  const [editingHolding, setEditingHolding] = useState<StockHoldingWithAccount | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<IStockPortfolioSymbolSummary | null>(null);
  const [defaultAccountId, setDefaultAccountId] = useState<number | null>(null);
  const [showAccountAllocation, setShowAccountAllocation] = useState(false);
  const [showAccountDetail, setShowAccountDetail] = useState(false);
  const { data, loading } = useStockPortfolio(refreshKey);

  const accounts = data?.accounts ?? [];
  const holdings = data?.holdings ?? [];
  const totalMarketValue = data?.totalMarketValue ?? 0;
  const accountOptions = accounts.map((account) => ({ label: account.name, value: String(account.id) }));
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

  const openSymbolModal = (summary: IStockPortfolioSymbolSummary) => {
    setSelectedSymbol(summary);
    setSymbolModalVisible(true);
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

  return (
    <div className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        股票持仓
      </NavBar>

      <section className={styles.summaryCard}>
        <div className={styles.summaryLabel}>总市值</div>
        <div className={styles.summaryValue}>{formatMoney(totalMarketValue)}</div>
        <div className={styles.summaryGrid}>
          <SummaryStat label="账户" value={`${accounts.length}`} />
          <SummaryStat label="股票" value={`${data?.symbolSummaries.length ?? 0}`} />
          <SummaryStat label="持仓" value={`${holdings.length}`} />
        </div>
      </section>

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
              {data?.accountSummaries.map((summary) => (
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

      {data && data.symbolSummaries.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionTitle}>股票占比</div>
          <List className={styles.list}>
            {data.symbolSummaries.map((summary) => (
              <List.Item key={summary.symbol} onClick={() => openSymbolModal(summary)} clickable>
                <div className={styles.symbolRow}>
                  <div className={styles.symbolMain}>
                    <span>{summary.symbol}</span>
                    <strong>{summary.name}</strong>
                  </div>
                  <div className={styles.symbolValue}>{formatMoney(summary.marketValue)}</div>
                </div>
                <div className={styles.itemMeta}>
                  {formatQuantity(summary.quantity)} 股 · {formatPercent(summary.percent)} · {summary.accounts.join(' / ')}
                </div>
                <div className={styles.barTrack}>
                  <span style={{ width: `${Math.min(summary.percent * 100, 100)}%` }} />
                </div>
              </List.Item>
            ))}
          </List>
        </section>
      )}

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

      <AccountModal
        key={editingAccount?.id ?? 'create-account'}
        visible={accountModalVisible}
        account={editingAccount}
        onClose={() => setAccountModalVisible(false)}
        onSave={saveAccount}
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
        onClose={() => setSymbolModalVisible(false)}
        onSave={saveSymbol}
        onDeleteHolding={deleteHolding}
      />
    </div>
  );
}

const SummaryStat = ({ label, value }: { label: string; value: string }) => (
  <div className={styles.summaryStat}>
    <strong>{value}</strong>
    <span>{label}</span>
  </div>
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
  onClose,
  onSave,
  onDeleteHolding,
}: {
  visible: boolean;
  summary: IStockPortfolioSymbolSummary | null;
  holdings: StockHoldingWithAccount[];
  onClose: () => void;
  onSave: (values: SymbolFormValues) => Promise<void>;
  onDeleteHolding: (holding: StockHoldingWithAccount) => Promise<void>;
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
