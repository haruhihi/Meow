'use client';
import {
  FloatingBubble,
  Modal,
  Form,
  Button,
  Input,
  Switch,
  List,
  SwipeAction,
  Empty,
  Toast,
  DatePicker,
  DatePickerRef,
  PullToRefresh,
  Selector,
} from 'antd-mobile';
import dayjs from 'dayjs';
import { PayCircleOutline } from 'antd-mobile-icons';
import { observer } from 'mobx-react-lite';
import { RefObject, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTransactions, useMonthAnalyze, usePaymentCoupons } from '@utils/transaction';
import { useActivityTypes } from '@utils/time-entry';
import { BillEntryIcon } from '@components/action-icons';
import { LoadingState } from '@components/loading';
import { TimeEntryFloatingButton } from '@components/time-entry-floating-button';
import { TimeEntryModal, type TimeEntryFormValues } from '@components/time-entry-modal';
import {
  useCategories,
  getCategoryOptions,
  flattenCategoryOptions,
  getIconByCategoryName,
} from '@utils/category';
import {
  IActivityTypeCreateReq,
  IActivityTypeCreateRes,
  ITimeEntryCreateReq,
  ITimeEntryCreateRes,
  TransactionWithCoupon,
} from '@dtos/meow';
import { post } from '@libs/fetch';
import { FormCascader } from '@components/form-cascader';
import { formatMoney, getCategoryColorByName } from '@styles/theme';
import { isMoneyGreater, roundMoney } from '@utils/money';
import { splitTimeRangeEvenly } from '@utils/time';
import { SummaryCard } from './components/summary-card';
import { TopCategories } from './components/top-categories';
import { DailyTrendChart } from './components/daily-trend-chart';
import styles from './bill.module.scss';

const BILL_TREND_STORAGE_KEY = 'meow.bill.showTrend';

const App = observer(function App() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [timeForm] = Form.useForm();
  const [visible, setVisible] = useState(false);
  const [timeVisible, setTimeVisible] = useState(false);
  const [categoryVisible, setCategoryVisible] = useState(false);
  const [month, setMonth] = useState(dayjs());
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTop, setSelectedTop] = useState<string | null>(null);
  const [showTrend, setShowTrend] = useState(true);
  const [includeCouponDiscount, setIncludeCouponDiscount] = useState(true);
  const [payTime, setPayTime] = useState(dayjs());
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithCoupon | null>(null);
  const [transactionSubmitting, setTransactionSubmitting] = useState(false);

  const categoryRes = useCategories();
  const { transactions, reQuery, loadMore, hasMore, createTransaction, updateTransaction, deleteTransactions } = useTransactions();
  const { data: monthData } = useMonthAnalyze(month, refreshKey, includeCouponDiscount);
  const { data: prevMonthData } = useMonthAnalyze(month.subtract(1, 'month'), refreshKey, includeCouponDiscount);
  const paymentCoupons = usePaymentCoupons(payTime, refreshKey);
  const activityRes = useActivityTypes(refreshKey);
  const activityTypes = activityRes.activityTypes ?? [];
  const categories = categoryRes?.categories ?? [];
  const recentTransactions = transactions ?? [];
  const initialLoading = !categoryRes || transactions === undefined || monthData === null;

  useEffect(() => {
    const saved = window.localStorage.getItem(BILL_TREND_STORAGE_KEY);
    if (saved === 'expanded' || saved === 'collapsed') {
      setShowTrend(saved === 'expanded');
    }
  }, []);

  const toggleTrend = () => {
    setShowTrend((current) => {
      const next = !current;
      window.localStorage.setItem(BILL_TREND_STORAGE_KEY, next ? 'expanded' : 'collapsed');
      return next;
    });
  };

  const openAnalyze = () => {
    const params = new URLSearchParams({
      year: String(month.year()),
      month: String(month.month() + 1),
      coupon: includeCouponDiscount ? '1' : '0',
    });
    const selectedCategoryId = selectedTop
      ? categories.find((category) => category.parentId == null && category.name === selectedTop)?.id
      : undefined;
    if (selectedCategoryId) {
      params.set('categoryId', String(selectedCategoryId));
    }
    router.push(`/meow/analyze?${params.toString()}`);
  };

  // Resolver: category id -> top-level category name. Built from the current
  // categories payload (or a no-op while loading). Must live BEFORE any early
  // return so the hook order is stable.
  const topNameOf = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return (id: number): string | undefined => {
      let cur = byId.get(id);
      const seen = new Set<number>();
      while (cur && cur.parentId != null) {
        if (seen.has(cur.id)) break;
        seen.add(cur.id);
        const p = byId.get(cur.parentId);
        if (!p) break;
        cur = p;
      }
      return cur?.name;
    };
  }, [categories]);

  const filteredMonthTxns = useMemo(() => {
    const list = monthData?.transactions ?? [];
    if (!selectedTop) return list;
    return list.filter((t) => topNameOf(t.category.id) === selectedTop);
  }, [monthData, selectedTop, topNameOf]);

  const filteredRecent = useMemo(() => {
    const list = recentTransactions;
    if (!selectedTop) return list;
    return list.filter((t) => topNameOf(t.category.id) === selectedTop);
  }, [recentTransactions, selectedTop, topNameOf]);

  const cascaderOptions = useMemo(
    () => getCategoryOptions(categories),
    [categories]
  );
  const flatCategoryOptions = useMemo(
    () => flattenCategoryOptions(cascaderOptions),
    [cascaderOptions]
  );
  const frequentCategoryOptions = useMemo(() => {
    const ranking = new Map<string, { count: number; lastUsedAt: number }>();
    const optionsByLeafId = new Map(
      flatCategoryOptions.map((option) => [option.value[option.value.length - 1], option])
    );

    [...(monthData?.transactions ?? []), ...recentTransactions].forEach((transaction) => {
      const key = String(transaction.category.id);
      const current = ranking.get(key) ?? { count: 0, lastUsedAt: 0 };
      current.count += 1;
      current.lastUsedAt = Math.max(current.lastUsedAt, new Date(transaction.date).getTime());
      ranking.set(key, current);
    });

    const rankedOptions = [...ranking.entries()]
      .sort((left, right) => {
        if (right[1].count !== left[1].count) {
          return right[1].count - left[1].count;
        }
        return right[1].lastUsedAt - left[1].lastUsedAt;
      })
      .map(([key]) => optionsByLeafId.get(key))
      .filter((option): option is NonNullable<typeof option> => Boolean(option));

    return (rankedOptions.length > 0 ? rankedOptions : flatCategoryOptions).slice(0, 6);
  }, [flatCategoryOptions, monthData?.transactions, recentTransactions]);

  const availablePaymentCoupons = useMemo(() => {
    const currentCoupon = editingTransaction?.coupon;
    if (!currentCoupon || editingTransaction.couponDiscount <= 0 || paymentCoupons.some((coupon) => coupon.id === currentCoupon.id)) {
      return paymentCoupons;
    }
    return [...paymentCoupons, currentCoupon];
  }, [editingTransaction, paymentCoupons]);

  const couponOptions = useMemo(
    () =>
      availablePaymentCoupons.map((coupon) => ({
        label: (
          <span className={styles.couponOption}>
            <span className={styles.couponOptionTitle}>
              <span className={styles.couponOptionIcon}>
                <PayCircleOutline />
              </span>
              <span className={styles.couponOptionName}>{coupon.name}</span>
              <span className={styles.couponOptionDate}>
                {coupon.validYear}/{String(coupon.validMonth).padStart(2, '0')}
              </span>
            </span>
            <span className={styles.couponOptionAmount}>
              <span>剩余：{formatMoney(coupon.remainingAmount)}</span>
              <span className={styles.couponOptionAmountExtra}>总：{formatMoney(coupon.amount)}</span>
            </span>
          </span>
        ),
        value: String(coupon.id),
      })),
    [availablePaymentCoupons]
  );
  const openCreateTransaction = () => {
    const now = new Date();
    setEditingTransaction(null);
    setPayTime(dayjs(now));
    form.resetFields();
    form.setFieldsValue({
      time: now,
      useCoupon: false,
      couponId: undefined,
      couponDiscount: undefined,
      amount: undefined,
      category: undefined,
      description: undefined,
    });
    setVisible(true);
    setCategoryVisible(true);
  };

  const openEditTransaction = (transaction: TransactionWithCoupon) => {
    const time = new Date(transaction.date);
    const category = flatCategoryOptions.find((option) => option.value.at(-1) === String(transaction.category.id))?.value;
    setEditingTransaction(transaction);
    setPayTime(dayjs(time));
    form.resetFields();
    form.setFieldsValue({
      time,
      useCoupon: transaction.couponDiscount > 0,
      couponId: transaction.couponId ? [String(transaction.couponId)] : undefined,
      couponDiscount: transaction.couponDiscount > 0 ? String(transaction.couponDiscount) : undefined,
      amount: String(transaction.amount),
      category,
      description: transaction.description ?? undefined,
    });
    setVisible(true);
    setCategoryVisible(false);
  };

  const openTimeCreate = () => {
    const endedAt = dayjs().second(0).millisecond(0).toDate();
    const startedAt = dayjs(endedAt).subtract(1, 'hour').toDate();
    timeForm.resetFields();
    timeForm.setFieldsValue({
      activityTypeId: activityTypes[0] ? [String(activityTypes[0].id)] : undefined,
      customActivityName: undefined,
      startedAt,
      endedAt,
      note: undefined,
    });
    setTimeVisible(true);
  };

  const submitTimeEntry = async (values: TimeEntryFormValues) => {
    let activityTypeIds = values.activityTypeId?.map((activityTypeId) => Number(activityTypeId)).filter(Boolean) ?? [];
    const customActivityName = values.customActivityName?.trim();
    if (!values.startedAt || !values.endedAt) {
      Toast.show({ content: '请选择起止时间' });
      return;
    }
    if (dayjs(values.endedAt).isSame(values.startedAt) || dayjs(values.endedAt).isBefore(values.startedAt)) {
      Toast.show({ content: '结束时间需要晚于开始时间' });
      return;
    }

    if (customActivityName) {
      const res = await post<IActivityTypeCreateReq, IActivityTypeCreateRes>('/api/time/activity-type/create', {
        name: customActivityName,
      });
      activityTypeIds = [res.activityType.id];
    }

    if (activityTypeIds.length <= 0) {
      Toast.show({ content: '请选择活动或输入新项目' });
      return;
    }

    const segments = splitTimeRangeEvenly(values.startedAt, values.endedAt, activityTypeIds.length);
    for (const [index, segment] of segments.entries()) {
      await post<ITimeEntryCreateReq, ITimeEntryCreateRes>('/api/time-entry/create', {
        activityTypeId: activityTypeIds[index],
        startedAt: segment.startedAt.getTime(),
        endedAt: segment.endedAt.getTime(),
        note: values.note,
      });
    }

    setTimeVisible(false);
    await new Promise<void>((resolve) => {
      Toast.show({
        content: '时间记录成功',
        afterClose: () => {
          router.push('/meow/time');
          resolve();
        },
      });
    });
  };

  return (
    <div className={styles.page}>
      <PullToRefresh
        onRefresh={async () => {
          await reQuery();
          setRefreshKey((k) => k + 1);
        }}
      >
        <SummaryCard
          month={month}
          onMonthChange={setMonth}
          transactions={monthData?.transactions ?? []}
          prevMonthTotal={prevMonthData?.total}
          couponDiscountTotal={monthData?.couponDiscountTotal}
          includeCouponDiscount={includeCouponDiscount}
          onIncludeCouponDiscountChange={setIncludeCouponDiscount}
          onAnalyzeClick={openAnalyze}
        />

        {initialLoading ? (
          <LoadingState className={styles.pageLoading} label="账单加载中" />
        ) : (
          <>
            {monthData && monthData.transactions.length > 0 && (
              <>
                <TopCategories
                  month={month}
                  transactions={monthData.transactions}
                  categories={categories}
                  selected={selectedTop}
                  onSelect={setSelectedTop}
                />

                <div className={styles.sectionHeader}>
                  <span>本月趋势</span>
                  <button type="button" className={styles.linkBtn} onClick={toggleTrend}>
                    {showTrend ? '收起' : '展开'}
                  </button>
                </div>
                {showTrend && (
                  <div className={styles.trendCard}>
                    <DailyTrendChart month={month} transactions={filteredMonthTxns} />
                  </div>
                )}
              </>
            )}

            <div className={[styles.sectionHeader, styles.recentHeader].join(' ')}>
              <span>最近记录{selectedTop ? ` · ${selectedTop}` : ''}</span>
            </div>

            {filteredRecent.length > 0 ? (
              <GroupedList
                transactions={filteredRecent}
                getTopName={topNameOf}
                onDelete={async (id) => {
                  await deleteTransactions({ ids: [id] });
                  Toast.show({ content: '删除成功' });
                  setRefreshKey((k) => k + 1);
                }}
                onEdit={openEditTransaction}
                hasMore={hasMore && !selectedTop}
                onLoadMore={loadMore}
              />
            ) : (
              <Empty
                style={{ padding: '64px 0' }}
                imageStyle={{ width: 128 }}
                description={selectedTop ? `${selectedTop} 暂无记录` : '暂无记录'}
              />
            )}
          </>
        )}

        <div className={styles.endSpacer} />
      </PullToRefresh>

      <FloatingBubble
        style={{
          '--initial-position-bottom': 'calc(100px + max(env(safe-area-inset-bottom), 0px))',
          '--initial-position-right': '24px',
          '--edge-distance': '44px',
          '--background': 'var(--meow-accent-gradient)',
        }}
        onClick={openCreateTransaction}
      >
        <span className={styles.actionIconWrap}><BillEntryIcon className={styles.actionIcon} /></span>
      </FloatingBubble>

      <TimeEntryFloatingButton
        initialPositionBottom="calc(168px + max(env(safe-area-inset-bottom), 0px))"
        activityTypes={activityTypes}
        onClick={openTimeCreate}
        onQuickCreateSuccess={activityRes.reQuery}
      />

      <Modal
        visible={visible}
        title={editingTransaction ? '编辑账单' : '新增账单'}
        closeOnMaskClick
        showCloseButton
        onClose={() => {
          setVisible(false);
          setEditingTransaction(null);
        }}
        content={
          <Form
            form={form}
            layout="horizontal"
            footer={
              <Button block type="submit" color="primary" size="large" loading={transactionSubmitting} disabled={transactionSubmitting}>
                提交
              </Button>
            }
            initialValues={{ time: new Date(), useCoupon: false }}
            style={{ marginTop: '20px' }}
            onValuesChange={(_, values) => {
              if (values.time) setPayTime(dayjs(values.time));
              if (!values.useCoupon) {
                form.setFieldsValue({ couponId: undefined, couponDiscount: undefined });
                form.setFields([
                  { name: ['couponId'], errors: [] },
                  { name: ['couponDiscount'], errors: [] },
                ]);
              }
              const couponId = values.couponId?.[0];
              const hasValidCoupon = Boolean(
                couponId && availablePaymentCoupons.some((coupon) => String(coupon.id) === String(couponId))
              );
              if (!hasValidCoupon) {
                form.setFields([
                  {
                    name: ['couponDiscount'],
                    errors: [],
                  },
                ]);
              }
            }}
            onFinish={async (values: {
              amount: string;
              category: string[];
              time: Date;
              useCoupon?: boolean;
              description?: string;
              couponId?: string[];
              couponDiscount?: string;
            }) => {
              if (transactionSubmitting) return;

              try {
                setTransactionSubmitting(true);
                if (!values) return;
                const { amount, category, time, useCoupon, description, couponId, couponDiscount } = values;
                if (!category?.length) {
                  Toast.show({ content: '请选择分类' });
                  return;
                }
                const selectedCouponId = useCoupon && couponId?.[0] ? Number(couponId[0]) : undefined;
                const amountValue = roundMoney(amount);
                const discount = useCoupon ? roundMoney(couponDiscount || 0) : 0;
                const selectedCoupon = selectedCouponId
                  ? availablePaymentCoupons.find((coupon) => coupon.id === selectedCouponId)
                  : undefined;
                const availableCouponAmount = selectedCoupon
                  ? roundMoney(selectedCoupon.remainingAmount + (editingTransaction?.couponId === selectedCoupon.id ? editingTransaction.couponDiscount : 0))
                  : 0;
                if (discount < 0) {
                  Toast.show({ content: '抵扣金额不能小于 0' });
                  return;
                }
                if (isMoneyGreater(discount, amountValue)) {
                  Toast.show({ content: '抵扣金额不能超过消费金额' });
                  return;
                }
                if (discount > 0 && !selectedCoupon) {
                  Toast.show({ content: '请选择要使用的券' });
                  return;
                }
                if (selectedCoupon && isMoneyGreater(discount, availableCouponAmount)) {
                  Toast.show({ content: '抵扣金额不能超过券余额' });
                  return;
                }
                const payload = {
                  amount: amountValue,
                  categoryId: Number(category[category.length - 1]),
                  date: dayjs(time).unix() * 1000,
                  description,
                  couponId: selectedCouponId,
                  couponDiscount: discount,
                };
                if (editingTransaction) {
                  await updateTransaction({ id: editingTransaction.id, ...payload });
                } else {
                  await createTransaction(payload);
                }
                await new Promise<void>((resolve) => {
                  Toast.show({
                    content: editingTransaction ? '修改成功' : '记录成功',
                    afterClose: () => {
                      setVisible(false);
                      setEditingTransaction(null);
                      setRefreshKey((k) => k + 1);
                      resolve();
                    },
                  });
                });
              } finally {
                setTransactionSubmitting(false);
              }
            }}
          >
            <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
              <FormCascader
                options={cascaderOptions ?? []}
                categoryVisible={categoryVisible}
                setCategoryVisible={(v: boolean) => setCategoryVisible(v)}
                frequentOptions={frequentCategoryOptions}
                loading={!categoryRes}
              />
            </Form.Item>

            <Form.Item
              name="time"
              label="时间"
              trigger="onConfirm"
              onClick={(e, datePickerRef: RefObject<DatePickerRef>) => {
                datePickerRef.current?.open();
              }}
            >
              <DatePicker precision="minute">
                {(value) => (value ? dayjs(value).format('YYYY/MM/DD HH:mm') : '请选择日期')}
              </DatePicker>
            </Form.Item>

            <Form.Item name="amount" label="金额" rules={[{ required: true, message: '金额不能为空' }]}>
              <Input placeholder="请输入金额" type="number" />
            </Form.Item>

            <Form.Item name="useCoupon" label="使用券" valuePropName="checked">
              <Switch />
            </Form.Item>

            <Form.Item noStyle shouldUpdate={(prev, next) => prev.useCoupon !== next.useCoupon}>
              {({ getFieldValue }) => {
                const useCoupon = Boolean(getFieldValue('useCoupon'));
                if (!useCoupon) return null;

                return (
                  <>
                    {couponOptions.length > 0 && (
                      <Form.Item name="couponId" className={styles.couponField}>
                        <Selector className={styles.couponSelector} columns={1} options={couponOptions} />
                      </Form.Item>
                    )}

                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.couponId !== next.couponId}>
                      {({ getFieldValue: getNestedFieldValue }) => {
                        const couponId = getNestedFieldValue('couponId')?.[0];
                        const hasValidCoupon = Boolean(
                          couponId && availablePaymentCoupons.some((coupon) => String(coupon.id) === String(couponId))
                        );

                        return (
                          <Form.Item
                            key={hasValidCoupon ? 'coupon-discount-required' : 'coupon-discount-optional'}
                            name="couponDiscount"
                            label="抵扣"
                            required={hasValidCoupon}
                            rules={hasValidCoupon ? [{ required: true, message: '已选券时请填写抵扣金额' }] : []}
                          >
                            <Input placeholder="本次券抵扣金额" type="number" />
                          </Form.Item>
                        );
                      }}
                    </Form.Item>
                  </>
                );
              }}
            </Form.Item>

            <Form.Item name="description" label="备注">
              <Input placeholder="请输入备注" type="string" />
            </Form.Item>
          </Form>
        }
      />

      <TimeEntryModal
        visible={timeVisible}
        form={timeForm}
        title="新增时间记录"
        submitText="提交并查看时间页"
        activityTypes={activityTypes}
        onClose={() => setTimeVisible(false)}
        onFinish={submitTimeEntry}
      />
    </div>
  );
});

export default App;

type Txns = NonNullable<ReturnType<typeof useTransactions>['transactions']>;

interface GroupedListProps {
  transactions: Txns;
  getTopName: (id: number) => string | undefined;
  onDelete: (id: number) => Promise<void>;
  onEdit: (transaction: Txns[number]) => void;
  hasMore: boolean;
  onLoadMore: () => Promise<unknown>;
}

const GroupedList = ({ transactions, getTopName, onDelete, onEdit, hasMore, onLoadMore }: GroupedListProps) => {
  const groups = useMemo(() => {
    const m = new Map<string, Txns>();
    transactions.forEach((t) => {
      const key = dayjs(t.date).format('YYYY-MM-DD');
      const arr = m.get(key) ?? [];
      arr.push(t);
      m.set(key, arr);
    });
    return [...m.entries()].map(([date, items]) => ({
      date,
      total: items.reduce((s, t) => s + Math.max(0, t.amount - t.couponDiscount), 0),
      items,
    }));
  }, [transactions]);

  return (
    <div>
      {groups.map((g) => (
        <div key={g.date} className={styles.group}>
          <div className={styles.groupHeader}>
            <div>
              <span className={styles.groupDate}>{dayjs(g.date).format('MM月DD日')}</span>
              <span className={styles.groupWeekday}>{dayjs(g.date).format('ddd')}</span>
            </div>
            <span className={styles.groupTotal}>{formatMoney(g.total)}</span>
          </div>
          <List>
            {g.items.map((transaction) => {
              const { description, category } = transaction;
              const topName = getTopName(category.id) ?? category.name;
              const Icon = getIconByCategoryName(topName);
              const color = getCategoryColorByName(topName);
              const netAmount = Math.max(0, transaction.amount - transaction.couponDiscount);
              const couponText = transaction.couponDiscount > 0
                ? ` · ${transaction.coupon?.name ?? transaction.couponName ?? '券'}抵扣 ${formatMoney(transaction.couponDiscount)}`
                : '';
              return (
                <SwipeAction
                  key={transaction.id}
                  rightActions={[
                    {
                      key: 'edit',
                      text: '编辑',
                      color: 'primary',
                      onClick: () => onEdit(transaction),
                    },
                    {
                      key: 'delete',
                      text: '删除',
                      color: 'danger',
                      onClick: () => onDelete(transaction.id),
                    },
                  ]}
                >
                  <List.Item
                    prefix={
                      <div className={styles.iconWrap} style={{ background: color + '22', color }}>
                        <Icon />
                      </div>
                    }
                    description={
                      <span className={styles.itemDesc}>
                        {dayjs(transaction.date).format('HH:mm')}
                        {description ? ` · ${description}` : ''}
                        {couponText}
                      </span>
                    }
                    extra={<span className={styles.itemAmount}>{formatMoney(netAmount)}</span>}
                  >
                    <span className={styles.itemTitle}>{category.name}</span>
                  </List.Item>
                </SwipeAction>
              );
            })}
          </List>
        </div>
      ))}

      {hasMore && (
        <div className={styles.loadMore}>
          <Button
            size="small"
            fill="none"
            onClick={() => {
              void onLoadMore();
            }}
          >
            加载更多
          </Button>
        </div>
      )}
      {!hasMore && transactions.length > 0 && (
        <div className={styles.endText}>— 没有更多了 —</div>
      )}
    </div>
  );
};
