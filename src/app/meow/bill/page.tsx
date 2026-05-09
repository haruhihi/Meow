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
import { HandPayCircleOutline, PayCircleOutline, PieOutline } from 'antd-mobile-icons';
import { RefObject, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTransactions, useMonthAnalyze, usePaymentCoupons } from '@utils/transaction';
import {
  useCategories,
  getCategoryOptions,
  flattenCategoryOptions,
  getIconFromCategoryId,
  getColorFromCategoryId,
  primeCategoryResolvers,
} from '@utils/category';
import { ITransactionCreateReq, ITransactionCreateRes } from '@dtos/meow';
import { post } from '@libs/fetch';
import { FormCascader } from '@components/form-cascader';
import { TopLoading } from '@components/loading';
import { formatMoney } from '@styles/theme';
import { SummaryCard } from './components/summary-card';
import { TopCategories } from './components/top-categories';
import { DailyTrendChart } from './components/daily-trend-chart';
import styles from './bill.module.scss';

export default function App() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [visible, setVisible] = useState(false);
  const [categoryVisible, setCategoryVisible] = useState(false);
  const [month, setMonth] = useState(dayjs());
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTop, setSelectedTop] = useState<string | null>(null);
  const [showTrend, setShowTrend] = useState(true);
  const [payTime, setPayTime] = useState(dayjs());

  const categoryRes = useCategories();
  const { transactions, reQuery, loadMore, hasMore } = useTransactions();
  const { data: monthData } = useMonthAnalyze(month, refreshKey);
  const { data: prevMonthData } = useMonthAnalyze(month.subtract(1, 'month'), refreshKey);
  const paymentCoupons = usePaymentCoupons(payTime, refreshKey);

  // Resolver: category id -> top-level category name. Built from the current
  // categories payload (or a no-op while loading). Must live BEFORE any early
  // return so the hook order is stable.
  const topNameOf = useMemo(() => {
    const cats = categoryRes?.categories ?? [];
    const byId = new Map(cats.map((c) => [c.id, c]));
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
  }, [categoryRes?.categories]);

  const filteredMonthTxns = useMemo(() => {
    const list = monthData?.transactions ?? [];
    if (!selectedTop) return list;
    return list.filter((t) => topNameOf(t.category.id) === selectedTop);
  }, [monthData, selectedTop, topNameOf]);

  const filteredRecent = useMemo(() => {
    const list = transactions ?? [];
    if (!selectedTop) return list;
    return list.filter((t) => topNameOf(t.category.id) === selectedTop);
  }, [transactions, selectedTop, topNameOf]);

  const cascaderOptions = useMemo(
    () => getCategoryOptions(categoryRes?.categories ?? []),
    [categoryRes?.categories]
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

    [...(monthData?.transactions ?? []), ...(transactions ?? [])].forEach((transaction) => {
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
  }, [flatCategoryOptions, monthData?.transactions, transactions]);

  const couponOptions = useMemo(
    () =>
      paymentCoupons.map((coupon) => ({
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
              剩余 {formatMoney(coupon.remainingAmount)}（总：{formatMoney(coupon.amount)}）
            </span>
          </span>
        ),
        value: String(coupon.id),
      })),
    [paymentCoupons]
  );

  if (!categoryRes || transactions === undefined) {
    return <TopLoading />;
  }

  primeCategoryResolvers(categoryRes.categories);

  const onClick = () => {
    setPayTime(dayjs());
    setVisible(true);
    setCategoryVisible(true);
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
        />

        {monthData && monthData.transactions.length > 0 && (
          <>
            <TopCategories
              month={month}
              transactions={monthData.transactions}
              categories={categoryRes.categories}
              selected={selectedTop}
              onSelect={setSelectedTop}
            />

            <div className={styles.sectionHeader}>
              <span>本月趋势</span>
              <button type="button" className={styles.linkBtn} onClick={() => setShowTrend((v) => !v)}>
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

        <div className={styles.sectionHeader}>
          <span>最近记录{selectedTop ? ` · ${selectedTop}` : ''}</span>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => router.push('/meow/analyze')}
          >
            统计分析 <PieOutline />
          </button>
        </div>

        {filteredRecent.length > 0 ? (
          <GroupedList
            transactions={filteredRecent}
            onDelete={async (id) => {
              await post('/api/transaction/delete', { ids: [id] });
              Toast.show({ content: '删除成功', afterClose: () => reQuery() });
              setRefreshKey((k) => k + 1);
            }}
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

        <div className={styles.endSpacer} />
      </PullToRefresh>

      <FloatingBubble
        style={{
          '--initial-position-bottom': '100px',
          '--initial-position-right': '24px',
          '--edge-distance': '44px',
          '--background': 'var(--meow-primary)',
        }}
        onClick={onClick}
      >
        <HandPayCircleOutline fontSize={32} />
      </FloatingBubble>

      <Modal
        visible={visible}
        closeOnMaskClick
        showCloseButton
        onClose={() => setVisible(false)}
        content={
          <Form
            form={form}
            layout="horizontal"
            footer={
              <Button block type="submit" color="primary" size="large">
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
                couponId && paymentCoupons.some((coupon) => String(coupon.id) === String(couponId))
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
              if (!values) return;
              const { amount, category, time, useCoupon, description, couponId, couponDiscount } = values;
              const selectedCouponId = useCoupon && couponId?.[0] ? Number(couponId[0]) : undefined;
              const discount = useCoupon ? Number(couponDiscount || 0) : 0;
              const selectedCoupon = selectedCouponId
                ? paymentCoupons.find((coupon) => coupon.id === selectedCouponId)
                : undefined;
              if (discount < 0) {
                Toast.show({ content: '抵扣金额不能小于 0' });
                return;
              }
              if (discount > Number(amount)) {
                Toast.show({ content: '抵扣金额不能超过消费金额' });
                return;
              }
              if (discount > 0 && !selectedCoupon) {
                Toast.show({ content: '请选择要使用的券' });
                return;
              }
              if (selectedCoupon && discount > selectedCoupon.remainingAmount) {
                Toast.show({ content: '抵扣金额不能超过券余额' });
                return;
              }
              await post<ITransactionCreateReq, ITransactionCreateRes>('/api/transaction/create', {
                amount: Number(amount),
                categoryId: Number(category[category.length - 1]),
                date: dayjs(time).unix() * 1000,
                description,
                couponId: selectedCouponId,
                couponDiscount: discount,
              });
              Toast.show({
                content: '记录成功',
                afterClose: () => {
                  setVisible(false);
                  reQuery();
                  setRefreshKey((k) => k + 1);
                },
              });
            }}
          >
            <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
              <FormCascader
                options={cascaderOptions ?? []}
                categoryVisible={categoryVisible}
                setCategoryVisible={(v: boolean) => setCategoryVisible(v)}
                frequentOptions={frequentCategoryOptions}
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
                      <Form.Item name="couponId" label="券" className={styles.couponField}>
                        <Selector className={styles.couponSelector} columns={1} options={couponOptions} />
                      </Form.Item>
                    )}

                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.couponId !== next.couponId}>
                      {({ getFieldValue: getNestedFieldValue }) => {
                        const couponId = getNestedFieldValue('couponId')?.[0];
                        const hasValidCoupon = Boolean(
                          couponId && paymentCoupons.some((coupon) => String(coupon.id) === String(couponId))
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
    </div>
  );
}

type Txns = NonNullable<ReturnType<typeof useTransactions>['transactions']>;

interface GroupedListProps {
  transactions: Txns;
  onDelete: (id: number) => Promise<void>;
  hasMore: boolean;
  onLoadMore: () => Promise<unknown>;
}

const GroupedList = ({ transactions, onDelete, hasMore, onLoadMore }: GroupedListProps) => {
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
          <List className={styles.list}>
            {g.items.map((transaction) => {
              const Icon = getIconFromCategoryId(transaction.category.id);
              const color = getColorFromCategoryId(transaction.category.id);
              const { description, category } = transaction;
              const netAmount = Math.max(0, transaction.amount - transaction.couponDiscount);
              const couponText = transaction.couponDiscount > 0
                ? ` · ${transaction.coupon?.name ?? transaction.couponName ?? '券'}抵扣 ${formatMoney(transaction.couponDiscount)}`
                : '';
              return (
                <SwipeAction
                  key={transaction.id}
                  rightActions={[
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
