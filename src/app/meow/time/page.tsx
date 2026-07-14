'use client';

import {
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  List,
  Modal,
  PullToRefresh,
  Selector,
  SwipeAction,
  Switch,
  Toast,
} from 'antd-mobile';
import type { DatePickerRef } from 'antd-mobile';
import {
  ClockCircleOutline,
  LeftOutline,
  RightOutline,
} from 'antd-mobile-icons';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { post } from '@libs/fetch';
import { BillEntryFloatingButton } from '@components/bill-entry-floating-button';
import { FormCascader } from '@components/form-cascader';
import { LoadingState } from '@components/loading';
import { TimeEntryFloatingButton } from '@components/time-entry-floating-button';
import { TimeEntryModal, type TimeEntryFormValues } from '@components/time-entry-modal';
import { TimeGroupSettingsModal } from '@components/time-group-settings-modal';
import { useCategories, getCategoryOptions, flattenCategoryOptions } from '@utils/category';
import { isMoneyGreater, roundMoney } from '@utils/money';
import { usePaymentCoupons, useTransactions } from '@utils/transaction';
import {
  IActivityTypeCreateReq,
  IActivityTypeCreateRes,
  ITimeActivityGroupSummary,
  ITimeEntryCreateReq,
  ITimeEntryCreateRes,
  ITimeEntryUpdateReq,
  ITimeEntryUpdateRes,
  TimeActivityGroupWithActivityTypes,
  TimeEntryWithActivityType,
} from '@dtos/meow';
import { formatMoney, PALETTE } from '@styles/theme';
import { formatDuration, formatHours, minutesBetween } from '@utils/time';
import { getDefaultTimeEntryActivityTypeIds } from '@utils/time-activity';
import { useActivityTypes, useTimeActivityGroups, useTimeEntries, useTimeRangeAnalyze } from '@utils/time-entry';
import styles from './time.module.scss';

type TimeViewMode = 'day' | 'week' | 'month';
type AnalyzeData = NonNullable<ReturnType<typeof useTimeRangeAnalyze>['data']>;

const VIEW_MODE_OPTIONS = [
  { label: '今日', value: 'day' },
  { label: '一周', value: 'week' },
  { label: '一月', value: 'month' },
];

const getAnalyzeRange = (selectedDate: dayjs.Dayjs, viewMode: TimeViewMode) => {
  const end = selectedDate.startOf('day').add(1, 'day');
  if (viewMode === 'day') return { start: end.subtract(1, 'day'), end, days: 1 };
  if (viewMode === 'week') return { start: end.subtract(7, 'day'), end, days: 7 };
  return { start: end.subtract(30, 'day'), end, days: 30 };
};

const getViewStepDays = (viewMode: TimeViewMode) => {
  if (viewMode === 'week') return 7;
  if (viewMode === 'month') return 30;
  return 1;
};

const getRangeLabel = (range: ReturnType<typeof getAnalyzeRange>, viewMode: TimeViewMode) => {
  if (viewMode === 'day') return range.start.format('M 月 D 日');
  return `${range.start.format('M/D')} - ${range.end.subtract(1, 'day').format('M/D')}`;
};

const getEntryActivities = (entry: TimeEntryWithActivityType) => (
  entry.activities.length > 0 ? entry.activities.map((item) => item.activityType) : [entry.activityType]
);

const getTargetText = (targetDirection: ITimeActivityGroupSummary['targetDirection'], targetMinutes: number) => (
  `${targetDirection === 'AT_MOST' ? '≤' : '≥'} ${formatDuration(targetMinutes)}`
);

const meetsTarget = (
  minutes: number,
  targetMinutes: number,
  targetDirection: ITimeActivityGroupSummary['targetDirection']
) => (targetDirection === 'AT_MOST' ? minutes <= targetMinutes : minutes >= targetMinutes);

export default function TimePage() {
  const [form] = Form.useForm();
  const [entryVisible, setEntryVisible] = useState(false);
  const [billVisible, setBillVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntryWithActivityType | null>(null);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [viewMode, setViewMode] = useState<TimeViewMode>('week');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [analysisRefreshKey, setAnalysisRefreshKey] = useState(0);

  const activityRes = useActivityTypes();
  const groupRes = useTimeActivityGroups(activityRes.activityTypes !== undefined);
  const { timeEntries, reQuery, loadMore, hasMore } = useTimeEntries();
  const analyzeRange = useMemo(() => getAnalyzeRange(selectedDate, viewMode), [selectedDate, viewMode]);
  const groupsLoaded = groupRes.groups !== undefined;
  const { data: analyzeData } = useTimeRangeAnalyze(
    analyzeRange.start,
    analyzeRange.end,
    analysisRefreshKey,
    viewMode === 'day',
    groupsLoaded
  );

  const activityTypes = activityRes.activityTypes ?? [];
  const groups = groupRes.groups ?? [];
  const initialLoading = activityRes.activityTypes === undefined || !groupsLoaded || timeEntries === undefined || analyzeData === null;
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const selectedGroupSummary = analyzeData?.groupSummaries.find((summary) => summary.groupId === selectedGroupId);
  const latestEndedAt = useMemo(() => {
    const list = timeEntries ?? [];
    if (list.length === 0) return null;
    return new Date(Math.max(...list.map((entry) => new Date(entry.endedAt).getTime())));
  }, [timeEntries]);

  useEffect(() => {
    if (groups.length === 0) {
      if (selectedGroupId !== null) setSelectedGroupId(null);
      return;
    }
    if (selectedGroupId && groups.some((group) => group.id === selectedGroupId)) return;
    setSelectedGroupId(groups.find((group) => group.name === '屏幕')?.id ?? groups[0].id);
  }, [groups, selectedGroupId]);

  const refreshGroupsAndAnalysis = async () => {
    await groupRes.reQuery();
    setAnalysisRefreshKey((value) => value + 1);
  };

  const refreshAll = async () => {
    await reQuery();
    await activityRes.reQuery();
    await refreshGroupsAndAnalysis();
  };

  const changeSelectedDate = (date: dayjs.Dayjs) => {
    const today = dayjs().startOf('day');
    setSelectedDate(date.startOf('day').isAfter(today) ? today : date.startOf('day'));
  };

  const openCreate = () => {
    const endedAt = dayjs().second(0).millisecond(0);
    const latestEnd = latestEndedAt ? dayjs(latestEndedAt).second(0).millisecond(0) : null;
    const startedAt = latestEnd && latestEnd.isBefore(endedAt)
      ? latestEnd
      : endedAt.subtract(1, 'hour');
    setEditingEntry(null);
    form.resetFields();
    form.setFieldsValue({
      activityTypeId: getDefaultTimeEntryActivityTypeIds(activityTypes),
      customActivityName: undefined,
      startedAt: startedAt.toDate(),
      endedAt: endedAt.toDate(),
      note: undefined,
    });
    setEntryVisible(true);
  };

  const openEdit = (entry: TimeEntryWithActivityType) => {
    setEditingEntry(entry);
    form.resetFields();
    form.setFieldsValue({
      activityTypeId: getEntryActivities(entry).map((activity) => String(activity.id)),
      customActivityName: undefined,
      startedAt: new Date(entry.startedAt),
      endedAt: new Date(entry.endedAt),
      note: entry.note ?? undefined,
    });
    setEntryVisible(true);
  };

  const submitEntry = async (values: TimeEntryFormValues) => {
    let activityTypeIds = [...new Set(values.activityTypeId?.map((activityTypeId) => Number(activityTypeId)).filter(Boolean) ?? [])];
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

    if (activityTypeIds.length === 0) {
      Toast.show({ content: '请选择活动或输入新项目' });
      return;
    }

    if (editingEntry) {
      await post<ITimeEntryUpdateReq, ITimeEntryUpdateRes>('/api/time-entry/update', {
        id: editingEntry.id,
        activityTypeIds,
        startedAt: values.startedAt.getTime(),
        endedAt: values.endedAt.getTime(),
        note: values.note,
      });
    } else {
      await post<ITimeEntryCreateReq, ITimeEntryCreateRes>('/api/time-entry/create', {
        activityTypeIds,
        startedAt: values.startedAt.getTime(),
        endedAt: values.endedAt.getTime(),
        note: values.note,
      });
    }

    await new Promise<void>((resolve) => {
      Toast.show({
        content: editingEntry ? '已更新' : '记录成功',
        afterClose: () => {
          setEntryVisible(false);
          void refreshAll();
          resolve();
        },
      });
    });
  };

  const stepDays = getViewStepDays(viewMode);
  const previousDate = selectedDate.subtract(stepDays, 'day');
  const nextDate = selectedDate.add(stepDays, 'day');
  const isCurrentPeriod = selectedDate.isSame(dayjs(), 'day');

  return (
    <div className={styles.page}>
      <PullToRefresh onRefresh={refreshAll}>
        <header className={styles.topPanel}>
          <div className={styles.toolbar}>
            <Selector
              className={styles.viewModeSelector}
              columns={3}
              options={VIEW_MODE_OPTIONS}
              value={[viewMode]}
              onChange={(value) => {
                const nextViewMode = value[0] as TimeViewMode | undefined;
                if (nextViewMode) setViewMode(nextViewMode);
              }}
            />
            <div className={styles.toolbarActions}>
              <button
                type="button"
                aria-label="上一周期"
                className={styles.navButton}
                onClick={() => changeSelectedDate(previousDate)}
              >
                <LeftOutline />
              </button>
              <span className={styles.rangeLabel}>{getRangeLabel(analyzeRange, viewMode)}</span>
              <button
                type="button"
                aria-label="下一周期"
                className={styles.navButton}
                disabled={isCurrentPeriod}
                onClick={() => changeSelectedDate(nextDate)}
              >
                <RightOutline />
              </button>
              <button type="button" className={styles.configButton} onClick={() => setSettingsVisible(true)}>
                <span className={styles.buttonContent}>配置</span>
              </button>
            </div>
          </div>
        </header>

        {initialLoading ? (
          <LoadingState className={styles.pageLoading} label="时间加载中" />
        ) : (
          <>
            {groups.length > 0 ? (
              <section className={styles.groupSection} aria-label="时间分组">
                <div className={styles.groupGrid}>
                  {groups.map((group) => (
                    <TimeGroupCard
                      key={group.id}
                      group={group}
                      summary={analyzeData?.groupSummaries.find((summary) => summary.groupId === group.id)}
                      periodDays={analyzeRange.days}
                      selected={group.id === selectedGroupId}
                      onSelect={() => setSelectedGroupId(group.id)}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <section className={styles.setupCard}>
                <Empty description="还没有分组，请先设置你的时间分类" />
                <Button size="small" color="primary" onClick={() => setSettingsVisible(true)}>设置分组</Button>
              </section>
            )}

            {selectedGroup && selectedGroupSummary && (
              <section className={styles.trendSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <span>{selectedGroup.name}趋势</span>
                    <span className={styles.sectionTarget}>目标 {getTargetText(selectedGroup.targetDirection, selectedGroup.targetMinutes)}</span>
                  </div>
                  <span className={styles.sectionHint}>{viewMode === 'day' ? '按小时累计' : '按日记录'}</span>
                </div>
                <div className={styles.trendCard}>
                  {selectedGroupSummary.recordedDays > 0 ? (
                    <GroupTrendChart
                      viewMode={viewMode}
                      selectedDate={selectedDate}
                      summary={selectedGroupSummary}
                      periodDays={analyzeRange.days}
                      dailySummaries={analyzeData.dailySummaries}
                      hourlySummaries={analyzeData.hourlySummaries}
                    />
                  ) : (
                    <Empty imageStyle={{ width: 96 }} description="该周期暂无时间记录" />
                  )}
                </div>
              </section>
            )}

            <div className={[styles.sectionHeader, styles.recentHeader].join(' ')}>
              <span>最近记录</span>
              <span className={styles.sectionHint}>左滑可编辑或删除</span>
            </div>
            {timeEntries && timeEntries.length > 0 ? (
              <GroupedList
                entries={timeEntries}
                onEdit={openEdit}
                onDelete={async (id) => {
                  await post('/api/time-entry/delete', { ids: [id] });
                  Toast.show({ content: '删除成功', afterClose: () => void refreshAll() });
                }}
                hasMore={hasMore}
                onLoadMore={loadMore}
              />
            ) : (
              <Empty
                className={styles.emptyRecords}
                imageStyle={{ width: 112 }}
                description="还没有时间记录"
              />
            )}
          </>
        )}

        <div className={styles.endSpacer} />
      </PullToRefresh>

      <BillEntryFloatingButton
        initialPositionBottom="calc(100px + max(env(safe-area-inset-bottom), 0px))"
        onClick={() => setBillVisible(true)}
      />
      <TimeEntryFloatingButton
        initialPositionBottom="calc(168px + max(env(safe-area-inset-bottom), 0px))"
        activityTypes={activityTypes}
        onClick={openCreate}
        onQuickCreateSuccess={refreshAll}
      />

      <QuickBillEntryModal visible={billVisible} onClose={() => setBillVisible(false)} />
      <TimeEntryModal
        visible={entryVisible}
        form={form}
        title={editingEntry ? '编辑时间记录' : '新增时间记录'}
        submitText={editingEntry ? '保存' : '提交'}
        activityTypes={activityTypes}
        onClose={() => setEntryVisible(false)}
        onFinish={submitEntry}
      />
      <TimeGroupSettingsModal
        visible={settingsVisible}
        groups={groups}
        activityTypes={activityTypes}
        onClose={() => setSettingsVisible(false)}
        onSaved={refreshGroupsAndAnalysis}
      />
    </div>
  );
}

const TimeGroupCard = ({
  group,
  summary,
  periodDays,
  selected,
  onSelect,
}: {
  group: TimeActivityGroupWithActivityTypes;
  summary?: ITimeActivityGroupSummary;
  periodDays: number;
  selected: boolean;
  onSelect: () => void;
}) => {
  const averageMinutes = Math.round((summary?.minutes ?? 0) / Math.max(periodDays, 1));
  const averageMeetsTarget = Boolean(summary?.recordedDays)
    && meetsTarget(averageMinutes, group.targetMinutes, group.targetDirection);

  return (
    <button
      type="button"
      className={[styles.groupCard, selected ? styles.groupCardActive : ''].join(' ')}
      style={{ '--group-color': group.color } as CSSProperties}
      onClick={onSelect}
    >
      <div className={styles.groupCardTopLine}>
        <div className={styles.groupCardTitle}>
          <span className={styles.groupDot} />
          <span>{group.name}</span>
        </div>
        <span className={styles.groupProgress}>{summary?.targetMetDays ?? 0}/{periodDays}</span>
      </div>
      <div className={styles.groupDuration}>
        <span className={averageMeetsTarget ? styles.groupAverageMet : styles.groupAverageMiss}>
          {formatHours(averageMinutes)}
        </span>
        <span className={styles.groupDurationDivider}>/</span>
        <span className={styles.groupThreshold}>{formatHours(group.targetMinutes)}</span>
      </div>
    </button>
  );
};

const GroupTrendChart = ({
  viewMode,
  selectedDate,
  summary,
  periodDays,
  dailySummaries,
  hourlySummaries,
}: {
  viewMode: TimeViewMode;
  selectedDate: dayjs.Dayjs;
  summary: ITimeActivityGroupSummary;
  periodDays: number;
  dailySummaries: AnalyzeData['dailySummaries'];
  hourlySummaries: AnalyzeData['hourlySummaries'];
}) => {
  const option = useMemo(() => {
    const averageMinutes = Math.round(summary.minutes / Math.max(periodDays, 1));
    const averageMeetsTarget = summary.recordedDays > 0
      && meetsTarget(averageMinutes, summary.targetMinutes, summary.targetDirection);
    const averageColor = averageMeetsTarget ? PALETTE.success : PALETTE.danger;
    let labels: string[] = [];
    let values: Array<number | null> = [];

    if (viewMode === 'day') {
      const currentHour = dayjs().hour();
      const isToday = selectedDate.isSame(dayjs(), 'day');
      let cumulativeMinutes = 0;
      labels = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);
      values = labels.map((_, hour) => {
        const hourly = hourlySummaries[hour];
        cumulativeMinutes += hourly?.byGroup[String(summary.groupId)] ?? 0;
        return isToday && hour > currentHour ? null : cumulativeMinutes;
      });
    } else {
      labels = dailySummaries.map((daily) => daily.date.slice(5).replace('-', '/'));
      values = dailySummaries.map((daily) => (
        daily.hasRecords ? daily.byGroup[String(summary.groupId)] ?? 0 : null
      ));
    }

    const maxValue = Math.max(
      summary.targetMinutes,
      averageMinutes,
      ...values.filter((value): value is number => value !== null),
      60
    );
    const axisStep = maxValue <= 120 ? 30 : 60;
    const yAxisMax = Math.max(axisStep, Math.ceil(maxValue / axisStep) * axisStep);

    return {
      animationDuration: 260,
      color: [summary.color],
      grid: { left: 42, right: 16, top: 30, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: Array<{ axisValue: string; data: number | null }>) => {
          const point = params[0];
          return `${point?.axisValue ?? ''}<br/>${point?.data == null ? '未记录' : formatDuration(point.data)}`;
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: PALETTE.border } },
        axisTick: { show: false },
        axisLabel: {
          color: PALETTE.textMuted,
          fontSize: 10,
          interval: viewMode === 'day' ? 3 : labels.length > 14 ? 4 : 0,
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: yAxisMax,
        axisLabel: {
          color: PALETTE.textMuted,
          fontSize: 10,
          formatter: (value: number) => formatHours(value),
        },
        splitLine: { lineStyle: { color: PALETTE.border, type: 'dashed' } },
      },
      series: [{
        name: summary.name,
        type: 'line',
        data: values,
        smooth: viewMode !== 'day',
        connectNulls: false,
        showSymbol: viewMode !== 'day',
        symbolSize: 6,
        lineStyle: { width: 3 },
        areaStyle: { opacity: 0.08 },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            {
              yAxis: averageMinutes,
              lineStyle: { color: averageColor, type: 'dotted', width: 1.5 },
              label: { formatter: `平均 ${formatHours(averageMinutes)}`, color: averageColor, fontSize: 10 },
            },
            {
              yAxis: summary.targetMinutes,
              lineStyle: { color: PALETTE.warning, type: 'dashed', width: 1.5 },
              label: {
                formatter: `目标 ${getTargetText(summary.targetDirection, summary.targetMinutes)}`,
                color: PALETTE.warning,
                fontSize: 10,
              },
            },
          ],
        },
      }],
    };
  }, [dailySummaries, hourlySummaries, periodDays, selectedDate, summary, viewMode]);

  return <ReactECharts option={option} style={{ width: '100%', height: 260 }} notMerge lazyUpdate />;
};

const GroupedList = ({
  entries,
  onEdit,
  onDelete,
  hasMore,
  onLoadMore,
}: {
  entries: TimeEntryWithActivityType[];
  onEdit: (entry: TimeEntryWithActivityType) => void;
  onDelete: (id: number) => Promise<void>;
  hasMore: boolean;
  onLoadMore: () => Promise<unknown>;
}) => {
  const groups = useMemo(() => {
    const map = new Map<string, TimeEntryWithActivityType[]>();
    entries.forEach((entry) => {
      const key = dayjs(entry.endedAt).format('YYYY-MM-DD');
      const current = map.get(key) ?? [];
      current.push(entry);
      map.set(key, current);
    });
    return [...map.entries()].map(([date, items]) => ({
      date,
      total: items.reduce((sum, item) => sum + minutesBetween(item.startedAt, item.endedAt), 0),
      items,
    }));
  }, [entries]);

  return (
    <div>
      {groups.map((group) => (
        <div key={group.date} className={styles.recordGroup}>
          <div className={styles.groupHeader}>
            <div>
              <span className={styles.groupDate}>{dayjs(group.date).format('MM月DD日')}</span>
              <span className={styles.groupWeekday}>{dayjs(group.date).format('ddd')}</span>
            </div>
            <span className={styles.groupTotal}>{formatDuration(group.total)}</span>
          </div>
          <List>
            {group.items.map((entry) => {
              const activities = getEntryActivities(entry);
              const primaryActivity = activities[0] ?? entry.activityType;
              const entryMinutes = minutesBetween(entry.startedAt, entry.endedAt);
              return (
                <SwipeAction
                  key={entry.id}
                  rightActions={[
                    {
                      key: 'edit',
                      text: '编辑',
                      color: 'primary',
                      onClick: () => onEdit(entry),
                    },
                    {
                      key: 'delete',
                      text: '删除',
                      color: 'danger',
                      onClick: () => onDelete(entry.id),
                    },
                  ]}
                >
                  <List.Item
                    prefix={
                      <div className={styles.iconWrap} style={{ background: primaryActivity.color + '22', color: primaryActivity.color }}>
                        <ClockCircleOutline />
                      </div>
                    }
                    description={
                      <span className={styles.itemDesc}>
                        {dayjs(entry.startedAt).format('HH:mm')} - {dayjs(entry.endedAt).format('HH:mm')}
                        {activities.length > 1 ? ` · 每项 ${formatDuration(entryMinutes / activities.length)}` : ''}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </span>
                    }
                    extra={<span className={styles.itemAmount}>{formatDuration(entryMinutes)}</span>}
                    onClick={() => onEdit(entry)}
                  >
                    <span className={styles.itemTitle}>
                      {activities.map((activity) => (
                        <span key={activity.id} className={styles.activityChip}>
                          <span className={styles.activityChipDot} style={{ background: activity.color }} />
                          <span>{activity.name}</span>
                        </span>
                      ))}
                    </span>
                  </List.Item>
                </SwipeAction>
              );
            })}
          </List>
        </div>
      ))}

      {hasMore && (
        <div className={styles.loadMore}>
          <Button size="small" fill="none" onClick={() => void onLoadMore()}>加载更多</Button>
        </div>
      )}
      {!hasMore && entries.length > 0 && <div className={styles.endText}>— 没有更多了 —</div>}
    </div>
  );
};

const QuickBillEntryModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const [form] = Form.useForm();
  const [categoryVisible, setCategoryVisible] = useState(false);
  const [payTime, setPayTime] = useState(dayjs());
  const [refreshKey, setRefreshKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const categoryRes = useCategories();
  const { createTransaction } = useTransactions();
  const paymentCoupons = usePaymentCoupons(payTime, refreshKey);
  const categories = categoryRes?.categories ?? [];
  const cascaderOptions = useMemo(() => getCategoryOptions(categories), [categories]);
  const flatCategoryOptions = useMemo(() => flattenCategoryOptions(cascaderOptions), [cascaderOptions]);
  const frequentCategoryOptions = useMemo(() => flatCategoryOptions.slice(0, 6), [flatCategoryOptions]);
  const couponOptions = useMemo(
    () => paymentCoupons.map((coupon) => ({
      label: `${coupon.name} · 剩余 ${formatMoney(coupon.remainingAmount)}`,
      value: String(coupon.id),
    })),
    [paymentCoupons]
  );

  useEffect(() => {
    if (!visible) return;
    const now = new Date();
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
    setCategoryVisible(true);
  }, [form, visible]);

  return (
    <Modal
      visible={visible}
      title="新增账单"
      closeOnMaskClick
      showCloseButton
      onClose={onClose}
      content={
        <Form
          form={form}
          layout="horizontal"
          footer={
            <Button block type="submit" color="primary" size="large" loading={submitting} disabled={submitting}>
              提交
            </Button>
          }
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
            if (!hasValidCoupon) form.setFields([{ name: ['couponDiscount'], errors: [] }]);
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
            if (submitting) return;
            try {
              setSubmitting(true);
              const { amount, category, time, useCoupon, description, couponId, couponDiscount } = values;
              if (!category?.length) {
                Toast.show({ content: '请选择分类' });
                return;
              }
              const selectedCouponId = useCoupon && couponId?.[0] ? Number(couponId[0]) : undefined;
              const amountValue = roundMoney(amount);
              const discount = useCoupon ? roundMoney(couponDiscount || 0) : 0;
              const selectedCoupon = selectedCouponId
                ? paymentCoupons.find((coupon) => coupon.id === selectedCouponId)
                : undefined;
              const availableCouponAmount = selectedCoupon ? roundMoney(selectedCoupon.remainingAmount) : 0;
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
              await createTransaction({
                amount: amountValue,
                categoryId: Number(category[category.length - 1]),
                date: dayjs(time).unix() * 1000,
                description,
                couponId: selectedCouponId,
                couponDiscount: discount,
              });
              await new Promise<void>((resolve) => {
                Toast.show({
                  content: '记录成功',
                  afterClose: () => {
                    onClose();
                    setRefreshKey((value) => value + 1);
                    resolve();
                  },
                });
              });
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
            <FormCascader
              options={cascaderOptions ?? []}
              categoryVisible={categoryVisible}
              setCategoryVisible={setCategoryVisible}
              frequentOptions={frequentCategoryOptions}
              loading={!categoryRes}
            />
          </Form.Item>
          <Form.Item
            name="time"
            label="时间"
            trigger="onConfirm"
            onClick={(_, datePickerRef: RefObject<DatePickerRef>) => datePickerRef.current?.open()}
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
                    <Form.Item name="couponId">
                      <Selector columns={1} options={couponOptions} />
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
  );
};