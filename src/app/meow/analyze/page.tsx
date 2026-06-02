'use client';

import {
  NavBar,
  List,
  Toast,
  DatePicker,
  Empty,
  Switch,
  Popup,
  Modal,
} from 'antd-mobile';
import dayjs from 'dayjs';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RightOutline } from 'antd-mobile-icons';
import { TopLoading } from '@components/loading';
import { post } from '@libs/fetch';
import { ICategoryRes, ITransactionAnalyzeReq, ITransactionAnalyzeRes } from '@dtos/meow';
import { useCategories, getIconFromCategoryId, primeCategoryResolvers } from '@utils/category';
import { CHART_COLORS, formatMoney, getCategoryColorByName, PALETTE } from '@styles/theme';
import { DailyTrendChart } from '../bill/components/daily-trend-chart';
import styles from './analyze.module.scss';

type ViewMode = 'pie' | 'trend' | 'list';
type Category = ICategoryRes['categories'][number];
type CategoryNode = Category & { children: CategoryNode[] };
type PieDatum = { name: string; value: number; color: string; categoryId?: number };

const parseInitialMonth = (searchParams: ReturnType<typeof useSearchParams>) => {
  const year = Number(searchParams.get('year'));
  const month = Number(searchParams.get('month'));
  if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
    return new Date(year, month - 1, 1);
  }
  return new Date();
};

export default function AnalyzePage() {
  return (
    <Suspense fallback={<TopLoading />}>
      <AnalyzePageContent />
    </Suspense>
  );
}

function AnalyzePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryRes = useCategories();
  const categories = categoryRes?.categories;
  const [categoryVisible, setCategoryVisible] = useState(false);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [couponUsageVisible, setCouponUsageVisible] = useState(false);
  const [data, setData] = useState<ITransactionAnalyzeRes | null>(null);
  const [month, setMonth] = useState<Date>(() => parseInitialMonth(searchParams));
  const [selectedCategory, setSelectedCategory] = useState<string[] | undefined>();
  const [didInitCategoryFromQuery, setDidInitCategoryFromQuery] = useState(false);
  const [includeCouponDiscount, setIncludeCouponDiscount] = useState(() => searchParams.get('coupon') === '1');
  const [viewMode, setViewMode] = useState<ViewMode>('pie');
  const initialCategoryId = Number(searchParams.get('categoryId'));

  const categoryTree = useMemo(() => {
    if (!categories) return [] as CategoryNode[];
    const byParent = new Map<number | null, Category[]>();
    categories.forEach((category) => {
      const current = byParent.get(category.parentId) ?? [];
      current.push(category);
      byParent.set(category.parentId, current);
    });
    const build = (parentId: number | null): CategoryNode[] =>
      (byParent.get(parentId) ?? [])
        .sort((left, right) => left.id - right.id)
        .map((category) => ({ ...category, children: build(category.id) }));
    return build(null);
  }, [categories]);

  const categoryById = useMemo(() => {
    const map = new Map<number, Category>();
    categories?.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories]);

  const categoryPathById = useMemo(() => {
    return (categoryId: number) => {
      const path: Category[] = [];
      let current = categoryById.get(categoryId);
      const seen = new Set<number>();
      while (current && !seen.has(current.id)) {
        path.unshift(current);
        seen.add(current.id);
        current = current.parentId == null ? undefined : categoryById.get(current.parentId);
      }
      return path;
    };
  }, [categoryById]);

  const selectedNodes = useMemo(
    () => getNodesFromPath(categoryTree, selectedCategory ?? []),
    [categoryTree, selectedCategory]
  );

  const selectedCategoryIds = useMemo(
    () => selectedNodes.map((node) => node.id),
    [selectedNodes]
  );

  const selectCategoryPath = useCallback((path?: string[]) => {
    setSelectedCategory(path?.length ? path : undefined);
    setViewMode('pie');
  }, []);

  const selectCategoryId = useCallback((categoryId?: number) => {
    if (!categoryId) {
      selectCategoryPath(undefined);
      return;
    }
    const path = categoryPathById(categoryId).map((category) => String(category.id));
    selectCategoryPath(path.length > 0 ? path : undefined);
  }, [categoryPathById, selectCategoryPath]);

  useEffect(() => {
    if (didInitCategoryFromQuery) return;
    if (!Number.isFinite(initialCategoryId) || initialCategoryId <= 0) {
      setDidInitCategoryFromQuery(true);
      return;
    }
    if (categoryById.size === 0) return;

    const path = categoryPathById(initialCategoryId).map((category) => String(category.id));
    setSelectedCategory(path.length > 0 ? path : undefined);
    setDidInitCategoryFromQuery(true);
  }, [categoryById.size, categoryPathById, didInitCategoryFromQuery, initialCategoryId]);

  useEffect(() => {
    if (!categories) return;
    if (!didInitCategoryFromQuery && Number.isFinite(initialCategoryId) && initialCategoryId > 0 && categoryById.size > 0) return;

    const categoryId = selectedCategory?.[selectedCategory.length - 1];
    const timeObj = dayjs(month);
    let active = true;

    post<ITransactionAnalyzeReq, ITransactionAnalyzeRes>('/api/transaction/analyze', {
      categoryId: categoryId ? Number(categoryId) : undefined,
      year: timeObj.year(),
      month: timeObj.month() + 1,
      granularity: 'month',
      includeCouponDiscount,
    }).then((res) => {
      if (active) setData(res);
    }).catch((err) => {
      if (active) Toast.show({ content: `查询失败: ${err}`, position: 'bottom' });
    });

    return () => {
      active = false;
    };
  }, [categories, categoryById.size, didInitCategoryFromQuery, includeCouponDiscount, initialCategoryId, month, selectedCategory]);

  const pieData = useMemo(() => {
    if (!data || !data.transactions.length) return [] as PieDatum[];

    const map = new Map<number, { category: Category; value: number; topName?: string }>();
    const selectedDepth = selectedCategoryIds.length;

    data.transactions.forEach((t) => {
      const path = categoryPathById(t.category.id);
      const bucket = path[selectedDepth] ?? path[selectedDepth - 1] ?? path[0] ?? t.category;
      const topName = path[0]?.name;
      const current = map.get(bucket.id) ?? { category: bucket, value: 0, topName };
      current.value += t.amount;
      map.set(bucket.id, current);
    });

    return [...map.values()]
      .map((item, index) => ({
        name: item.category.name,
        categoryId: item.category.id,
        value: Number(item.value.toFixed(2)),
        color: getCategoryColorByName(item.topName) || CHART_COLORS[index % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [categoryPathById, data, selectedCategoryIds]);

  const pieOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => `${p.name}<br/>${formatMoney(p.value)}<br/>${p.percent}%`,
      },
      series: [
        {
          name: '支出',
          type: 'pie',
          radius: ['34%', '58%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
          label: {
            show: true,
            position: 'outside',
            formatter: (p: any) => `${p.name} ${p.percent}%`,
            fontSize: 11,
            color: PALETTE.textSub,
          },
          labelLine: { length: 10, length2: 10, smooth: true },
          data: pieData.map((d) => ({
            value: d.value,
            name: d.name,
            categoryId: d.categoryId,
            itemStyle: { color: d.color },
          })),
        },
      ],
    }),
    [pieData]
  );

  const pieEvents = useMemo(
    () => ({
      click: (params: any) => selectCategoryId(params?.data?.categoryId),
    }),
    [selectCategoryId]
  );

  if (!categories) return <TopLoading />;
  primeCategoryResolvers(categories);

  return (
    <div className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        统计分析
      </NavBar>

      <div className={styles.body}>
        <DatePicker
          precision="month"
          visible={monthPickerVisible}
          value={month}
          onClose={() => setMonthPickerVisible(false)}
          onConfirm={(value) => setMonth(value)}
        />

        {data && (
          <div className={styles.summaryCard}>
            <div>
              <div className={styles.summarySub}>
                共 {data.transactions.length} 笔 · <button type="button" className={styles.couponDiscountButton} disabled={data.couponUsages.length === 0} onClick={() => setCouponUsageVisible(true)}>券抵扣 {formatMoney(data.couponDiscountTotal)}</button>
              </div>
              <div className={styles.summaryTotal}>{formatMoney(data.total)}</div>
            </div>
            <div className={styles.summarySide}>
              <button type="button" className={styles.summaryMonth} onClick={() => setMonthPickerVisible(true)}>
                {dayjs(month).format('YYYY 年 M 月')}
              </button>
              <label className={styles.couponToggle}>
                <span>统计券</span>
                <Switch checked={includeCouponDiscount} onChange={setIncludeCouponDiscount} />
              </label>
            </div>
          </div>
        )}

        <div className={styles.categoryNav}>
          <div className={styles.crumbs}>
            <button
              type="button"
              className={selectedNodes.length === 0 ? styles.crumbActive : styles.crumb}
              onClick={() => selectCategoryPath(undefined)}
            >
              全部
            </button>
            {selectedNodes.map((node, index) => (
              <span key={node.id} className={styles.crumbGroup}>
                <span className={styles.crumbSep}>›</span>
                <button
                  type="button"
                  className={index === selectedNodes.length - 1 ? styles.crumbActive : styles.crumb}
                  onClick={() => selectCategoryPath(selectedCategory?.slice(0, index + 1))}
                >
                  {node.name}
                </button>
              </span>
            ))}
          </div>
          <CategoryScopePicker
            visible={categoryVisible}
            setVisible={setCategoryVisible}
            tree={categoryTree}
            value={selectedCategory}
            onChange={selectCategoryPath}
          />
        </div>

        <Modal
          visible={couponUsageVisible}
          title="券使用明细"
          closeOnMaskClick
          showCloseButton
          onClose={() => setCouponUsageVisible(false)}
          content={
            <List className={styles.couponUsageList}>
              {data?.couponUsages.map((usage) => (
                <List.Item
                  key={`${usage.couponId ?? 'deleted'}-${usage.name}`}
                  description={`${usage.count} 笔`}
                  extra={<span className={styles.amount}>{formatMoney(usage.discount)}</span>}
                >
                  {usage.name}
                </List.Item>
              ))}
            </List>
          }
        />

        {data && data.transactions.length > 0 ? (
          <>
            <div className={styles.selector}>
              <div className={styles.segmented}>
                {(['pie', 'trend', 'list'] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={viewMode === mode ? styles.segmentedActive : styles.segmentedItem}
                    onClick={() => setViewMode(mode)}
                  >
                    {mode === 'pie' ? '饼图' : mode === 'trend' ? '趋势' : '列表'}
                  </button>
                ))}
              </div>
            </div>

            {viewMode === 'pie' && (
              <>
                <div className={styles.chartWrap}>
                  <ReactECharts
                    option={pieOption}
                    onEvents={pieEvents}
                    style={{ width: '100%', height: 320 }}
                    notMerge
                    lazyUpdate
                  />
                </div>

                <div className={styles.breakdownTitle}>明细分布</div>
                <List className={styles.breakdownList}>
                  {pieData.map((d) => (
                    <List.Item
                      key={d.name}
                      prefix={<span className={styles.swatch} style={{ background: d.color }} />}
                      extra={<span className={styles.amount}>{formatMoney(d.value)}</span>}
                      onClick={() => selectCategoryId(d.categoryId)}
                    >
                      <span className={styles.breakName}>{d.name}</span>
                      <span className={styles.breakPct}>
                        {data.total > 0 ? ((d.value / data.total) * 100).toFixed(1) : '0.0'}%
                      </span>
                    </List.Item>
                  ))}
                </List>
              </>
            )}

            {viewMode === 'trend' && (
              <div className={styles.chartWrap}>
                <DailyTrendChart month={dayjs(month)} transactions={data.transactions} height={260} />
              </div>
            )}

            {viewMode === 'list' && (
              <List>
                {data.transactions.map((transaction) => {
                  const Icon = getIconFromCategoryId(transaction.category.id);
                  const { description } = transaction;
                  return (
                    <List.Item
                      key={transaction.id}
                      prefix={<Icon style={{ fontSize: 22, color: PALETTE.primary }} />}
                      description={`${dayjs(transaction.date).format('MM-DD HH:mm')} · ${transaction.category.name}`}
                      extra={<span className={styles.amount}>{formatMoney(transaction.amount)}</span>}
                    >
                      {description || transaction.category.name}
                    </List.Item>
                  );
                })}
              </List>
            )}
          </>
        ) : (
          data && (
            <Empty style={{ padding: '64px 0' }} description="该月份无数据" />
          )
        )}

        <div className={styles.bottomSpacer} />
      </div>
    </div>
  );
}

const CategoryScopePicker: React.FC<{
  visible: boolean;
  setVisible: (visible: boolean) => void;
  tree: CategoryNode[];
  value?: string[];
  onChange: (value?: string[]) => void;
}> = ({ visible, setVisible, tree, value, onChange }) => {
  const [draftPath, setDraftPath] = useState<string[]>(value ?? []);
  const selectedNodes = getNodesFromPath(tree, draftPath);
  const currentOptions = selectedNodes.length > 0 ? selectedNodes[selectedNodes.length - 1].children : tree;

  const open = () => {
    setDraftPath(value ?? []);
    setVisible(true);
  };

  const confirm = () => {
    onChange(draftPath.length > 0 ? draftPath : undefined);
    setVisible(false);
  };

  return (
    <>
      <button type="button" className={styles.categoryTrigger} onClick={open}>
        <span>选择类目</span>
        <RightOutline />
      </button>
      <Popup
        visible={visible}
        onMaskClick={() => setVisible(false)}
        bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        <div className={styles.categoryPanel}>
          <div className={styles.categoryPanelHeader}>
            <div className={styles.categoryPanelTitle}>选择统计类目</div>
            <button type="button" className={styles.categoryPanelClose} onClick={() => setVisible(false)}>
              关闭
            </button>
          </div>

          <div className={styles.crumbs}>
            <button type="button" className={draftPath.length === 0 ? styles.crumbActive : styles.crumb} onClick={() => setDraftPath([])}>
              全部
            </button>
            {selectedNodes.map((node, index) => (
              <button
                key={node.id}
                type="button"
                className={index === selectedNodes.length - 1 ? styles.crumbActive : styles.crumb}
                onClick={() => setDraftPath(draftPath.slice(0, index + 1))}
              >
                {node.name}
              </button>
            ))}
          </div>

          <div className={styles.categoryActions}>
            <button type="button" className={styles.categoryPrimary} onClick={confirm}>
              使用当前范围
            </button>
            {draftPath.length > 0 && (
              <button type="button" className={styles.categorySecondary} onClick={() => setDraftPath(draftPath.slice(0, -1))}>
                返回上一级
              </button>
            )}
            <button type="button" className={styles.categoryGhost} onClick={() => setDraftPath([])}>
              全部
            </button>
          </div>

          <div className={styles.categoryList}>
            {currentOptions.length > 0 ? (
              currentOptions.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={styles.categoryItem}
                  onClick={() => setDraftPath([...draftPath, String(node.id)])}
                >
                  <span>{node.name}</span>
                  <span className={styles.categoryItemMeta}>{node.children.length > 0 ? '进入下一级' : '可直接统计'}</span>
                  {node.children.length > 0 && <RightOutline />}
                </button>
              ))
            ) : (
              <div className={styles.categoryEmpty}>当前类目没有子类目，可直接使用当前范围</div>
            )}
          </div>
        </div>
      </Popup>
    </>
  );
};

const getNodesFromPath = (tree: CategoryNode[], path: string[]) => {
  const nodes: CategoryNode[] = [];
  let options = tree;

  for (const id of path) {
    const node = options.find((item) => String(item.id) === id);
    if (!node) break;
    nodes.push(node);
    options = node.children;
  }

  return nodes;
};
