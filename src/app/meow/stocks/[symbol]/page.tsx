'use client';

import { RefObject, useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, DatePickerRef, Dialog, Empty, Form, Input, Modal, NavBar, PullToRefresh, TextArea, Toast } from 'antd-mobile';
import { AddCircleOutline, DeleteOutline, EditSOutline, FileOutline } from 'antd-mobile-icons';
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
import { formatMoney } from '@styles/theme';
import { formatStockQuantity } from '@utils/stock-calculations';
import { useStockAiPrompt, useStockAiReports, useStockDividends, useStockPortfolio, useStockRemarks } from '@utils/stock';
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

const formatPercent = (value?: number | null) => (value == null ? '—' : `${(value * 100).toFixed(2)}%`);
const formatOptionalNumber = (value?: number | null) => (value == null ? '—' : value.toFixed(2));
const formatDate = (value?: string | Date | null) => {
  if (!value) return '未知日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知日期';
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

const MetricGrid = ({ summary }: { summary: IStockPortfolioSymbolSummary }) => (
  <section className={styles.metricGrid}>
    <div><span>扣非 PE</span><strong>{formatOptionalNumber(summary.deductedPe)} / {formatOptionalNumber(summary.deductedPeTtm)}</strong><em>静 / TTM</em></div>
    <div><span>扣非 PEG</span><strong>{formatOptionalNumber(summary.deductedPeg)}</strong><em>CAGR {formatPercent(summary.deductedNetProfitCagr5)}</em></div>
    <div><span>PB</span><strong>{formatOptionalNumber(summary.pb)}</strong><em>资产</em></div>
    <div><span>扣非 ROE</span><strong>{formatPercent(summary.deductedRoeTtm)}</strong><em>TTM</em></div>
    <div><span>股息率</span><strong>{formatPercent(summary.normalizedDividendYield)}</strong><em>常态</em></div>
    <div><span>商誉</span><strong>{formatPercent(summary.goodwillToNetAsset)}</strong><em>占净资产 / {formatPercent(summary.goodwillToTotalAssets)}资产</em></div>
    <div><span>现金质量</span><strong>{formatOptionalNumber(summary.operatingCashFlowToDeductedNetProfit)} / {formatOptionalNumber(summary.fcfDividendCoverage)}</strong><em>含金量 / 分红覆盖</em></div>
    <div><span>市值</span><strong>{formatMoney(summary.marketValue)}</strong><em>持仓口径</em></div>
  </section>
);

const StockDetailPage = observer(function StockDetailPage({ params }: { params: { symbol: string } }) {
  const router = useRouter();
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const { data, loading: portfolioLoading, reQuery, updateHolding, deleteHolding: deleteStockHolding } = useStockPortfolio();
  const { reports, loading: reportsLoading } = useStockAiReports(0, symbol);
  const { data: promptData, loading: promptLoading, error: promptError, reQuery: reQueryPrompt } = useStockAiPrompt(symbol);
  const { remarks, loading: remarksLoading, createRemark, updateRemark, deleteRemark: deleteStockRemark } = useStockRemarks(symbol);
  const { events: dividendEvents, loading: dividendLoading, updateMarking: updateDividendMarking } = useStockDividends(symbol);
  const [promptVisible, setPromptVisible] = useState(false);
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

  const copyPrompt = async () => {
    if (!promptData?.prompt) return;
    try {
      await navigator.clipboard.writeText(promptData.prompt);
      Toast.show({ content: 'Prompt 已复制' });
    } catch (error) {
      Toast.show({ content: `复制失败: ${(error as Error).message}` });
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

        <section className={styles.promptBar}>
          <button type="button" onClick={() => setPromptVisible(true)}>
            <strong>Prompt</strong>
            <span>{promptData ? `${promptData.frameworkCards.length} 张方法卡片` : promptLoading ? <InlineLoading label="生成中" /> : '查看'}</span>
          </button>
          {promptError && <button type="button" onClick={() => { void reQueryPrompt().catch(() => undefined); }}>重试</button>}
        </section>

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

      <Modal
        visible={promptVisible}
        title="AI 财报解读 Prompt"
        closeOnMaskClick
        showCloseButton
        onClose={() => setPromptVisible(false)}
        content={
          promptData ? (
            <div className={styles.promptModal}>
              <Button size="small" color="primary" onClick={copyPrompt}>复制 Prompt</Button>
              <pre>{promptData.prompt}</pre>
            </div>
          ) : promptLoading ? (
            <LoadingState label="Prompt 生成中" compact />
          ) : (
            <Empty style={{ padding: '32px 0' }} description="暂无 Prompt" />
          )
        }
      />

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