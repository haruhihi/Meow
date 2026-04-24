'use client';

import {
  NavBar,
  Form,
  List,
  Toast,
  DatePicker,
  DatePickerRef,
  Selector,
  Empty,
} from 'antd-mobile';
import dayjs from 'dayjs';
import { RefObject, useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { useRouter } from 'next/navigation';
import { FormCascader } from '@components/form-cascader';
import { TopLoading } from '@components/loading';
import { post } from '@libs/fetch';
import { ITransactionAnalyzeReq, ITransactionAnalyzeRes } from '@dtos/meow';
import { useCategories, getCategoryOptions, getIconFromCategoryId, primeCategoryResolvers } from '@utils/category';
import { CHART_COLORS, formatMoney, getCategoryColorByName, PALETTE } from '@styles/theme';
import { DailyTrendChart } from '../bill/components/daily-trend-chart';
import styles from './analyze.module.scss';

type ViewMode = 'pie' | 'trend' | 'list';

export default function AnalyzePage() {
  const router = useRouter();
  const categoryRes = useCategories();
  const [categoryVisible, setCategoryVisible] = useState(false);
  const [data, setData] = useState<ITransactionAnalyzeRes | null>(null);
  const [month, setMonth] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('pie');
  const [groupByParent, setGroupByParent] = useState(true);

  const cascaderOptions = useMemo(
    () => (categoryRes ? getCategoryOptions(categoryRes.categories) : []),
    [categoryRes]
  );

  const fetchData = async (d: Date, categoryPath?: string[]) => {
    const categoryId = categoryPath?.[categoryPath.length - 1];
    const timeObj = dayjs(d);
    try {
      const res = await post<ITransactionAnalyzeReq, ITransactionAnalyzeRes>('/api/transaction/analyze', {
        categoryId: categoryId ? Number(categoryId) : undefined,
        year: timeObj.year(),
        month: timeObj.month() + 1,
        granularity: 'month',
      });
      setData(res);
    } catch (err) {
      Toast.show({ content: `查询失败: ${err}`, position: 'bottom' });
    }
  };

  useEffect(() => {
    fetchData(new Date());
  }, []);

  const pieData = useMemo(() => {
    if (!data || !data.transactions.length) return [] as { name: string; value: number; color: string }[];

    if (groupByParent) {
      const stripSuffix = (s: string) => s.replace(/\(子\)$/, '');
      const catToTop = new Map<string, string>();
      const walk = (options: any[], topName: string) => {
        if (!options) return;
        options.forEach((o) => {
          catToTop.set(String(o.value), topName);
          if (o.children?.length) walk(o.children, topName);
        });
      };
      (cascaderOptions ?? []).forEach((o: any) => {
        const top = stripSuffix(o.label);
        catToTop.set(String(o.value), top);
        if (o.children?.length) walk(o.children, top);
      });

      const map = new Map<string, number>();
      data.transactions.forEach((t) => {
        const name = catToTop.get(String(t.category.id)) ?? '其他';
        map.set(name, (map.get(name) ?? 0) + t.amount);
      });
      return [...map.entries()]
        .map(([name, value], i) => ({
          name,
          value: Number(value.toFixed(2)),
          color: getCategoryColorByName(name) || CHART_COLORS[i % CHART_COLORS.length],
        }))
        .sort((a, b) => b.value - a.value);
    }

    const map = new Map<string, number>();
    data.transactions.forEach((t) => {
      map.set(t.category.name, (map.get(t.category.name) ?? 0) + t.amount);
    });
    return [...map.entries()]
      .map(([name, value], i) => ({
        name,
        value: Number(value.toFixed(2)),
        color: CHART_COLORS[i % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [data, groupByParent, cascaderOptions]);

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
            itemStyle: { color: d.color },
          })),
        },
      ],
    }),
    [pieData]
  );

  if (!categoryRes) return <TopLoading />;
  primeCategoryResolvers(categoryRes.categories);

  return (
    <div className={styles.page}>
      <NavBar onBack={() => router.back()} className={styles.navbar}>
        统计分析
      </NavBar>

      <div className={styles.body}>
        <Form
          layout="horizontal"
          initialValues={{ time: new Date() }}
          onValuesChange={(_, values) => {
            setMonth(values.time ?? new Date());
            fetchData(values.time ?? new Date(), values.category);
          }}
        >
          <Form.Item
            name="time"
            label="月份"
            trigger="onConfirm"
            onClick={(e, ref: RefObject<DatePickerRef>) => ref.current?.open()}
          >
            <DatePicker precision="month">
              {(value) => (value ? dayjs(value).format('YYYY / MM') : '请选择月份')}
            </DatePicker>
          </Form.Item>
          <Form.Item name="category" label="类目">
            <FormCascader
              options={cascaderOptions ?? []}
              categoryVisible={categoryVisible}
              setCategoryVisible={(v: boolean) => setCategoryVisible(v)}
            />
          </Form.Item>
        </Form>

        {data && data.transactions.length > 0 ? (
          <>
            <div className={styles.summaryCard}>
              <div>
                <div className={styles.summarySub}>共 {data.transactions.length} 笔</div>
                <div className={styles.summaryTotal}>{formatMoney(data.total)}</div>
              </div>
              <div className={styles.summaryMonth}>{dayjs(month).format('YYYY 年 M 月')}</div>
            </div>

            <div className={styles.selector}>
              <Selector
                value={[viewMode]}
                onChange={(v) => v[0] && setViewMode(v[0] as ViewMode)}
                options={[
                  { label: '饼图', value: 'pie' },
                  { label: '趋势', value: 'trend' },
                  { label: '列表', value: 'list' },
                ]}
              />
            </div>

            {viewMode === 'pie' && (
              <>
                <div className={styles.selector}>
                  <Selector
                    value={[groupByParent ? 'parent' : 'leaf']}
                    onChange={(v) => v[0] && setGroupByParent(v[0] === 'parent')}
                    options={[
                      { label: '父类目', value: 'parent' },
                      { label: '详细', value: 'leaf' },
                    ]}
                  />
                </div>

                <div className={styles.chartWrap}>
                  <ReactECharts
                    option={pieOption}
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
                    >
                      <span className={styles.breakName}>{d.name}</span>
                      <span className={styles.breakPct}>
                        {((d.value / data.total) * 100).toFixed(1)}%
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
