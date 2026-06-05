'use client';

import {
  Button,
  Empty,
  Form,
  List,
  PullToRefresh,
  Selector,
  SwipeAction,
  Toast,
} from 'antd-mobile';
import {
  ClockCircleOutline,
  LeftOutline,
  RightOutline,
} from 'antd-mobile-icons';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import { useMemo, useState } from 'react';
import { post } from '@libs/fetch';
import { LoadingState } from '@components/loading';
import { TimeEntryFloatingButton } from '@components/time-entry-floating-button';
import { TimeEntryModal, type TimeEntryFormValues } from '@components/time-entry-modal';
import {
  IActivityTypeCreateReq,
  IActivityTypeCreateRes,
  ITimeActivitySummary,
  ITimeDailySummary,
  ITimeEntryCreateReq,
  ITimeEntryCreateRes,
  ITimeEntryUpdateReq,
  ITimeEntryUpdateRes,
  TimeEntryWithActivityType,
} from '@dtos/meow';
import { PALETTE } from '@styles/theme';
import { formatDuration, formatHours, minutesBetween, splitTimeRangeEvenly } from '@utils/time';
import { useActivityTypes, useTimeEntries, useTimeRangeAnalyze } from '@utils/time-entry';
import styles from './time.module.scss';

type AnalyzeData = NonNullable<ReturnType<typeof useTimeRangeAnalyze>['data']>;
type TimeViewMode = 'day' | 'week' | 'month';

type TimeChartPoint = Pick<ITimeDailySummary, 'minutes' | 'byActivity'> & {
  label: string;
};

type TimeViewData = {
  totalMinutes: number;
  recordedDays: number;
  totalLabel: string;
  rangeLabel: string;
  chartTitle: string;
  chartHint: string;
  activitySummaries: ITimeActivitySummary[];
  chartPoints: TimeChartPoint[];
  rhythmSegments: AnalyzeData['rhythmSegments'];
  sleepAverage: number;
  stats: { label: string; value: string }[];
};

const VIEW_MODE_OPTIONS = [
  { label: '按日', value: 'day' },
  { label: '近一周', value: 'week' },
  { label: '近一月', value: 'month' },
];

const buildActivitySummaries = ({
  byActivity,
  baseSummaries,
  entryCounts,
  divisor = 1,
}: {
  byActivity: Record<string, number>;
  baseSummaries: ITimeActivitySummary[];
  entryCounts?: Map<number, number>;
  divisor?: number;
}) => {
  const activityInfoMap = new Map(baseSummaries.map((summary) => [summary.activityTypeId, summary]));
  return Object.entries(byActivity)
    .map(([activityTypeId, minutes]) => {
      const id = Number(activityTypeId);
      const activity = activityInfoMap.get(id);
      if (!activity) return null;
      return {
        ...activity,
        minutes: Math.round(minutes / divisor),
        count: entryCounts?.get(id) ?? activity.count,
      };
    })
    .filter((summary): summary is ITimeActivitySummary => summary !== null && summary.minutes > 0)
    .sort((left, right) => right.minutes - left.minutes);
};

const getAnalyzeRange = (selectedDate: dayjs.Dayjs, viewMode: TimeViewMode) => {
  const selectedDayStart = selectedDate.startOf('day');
  if (viewMode === 'day') return { start: selectedDayStart, end: selectedDayStart.add(1, 'day'), days: 1 };

  const todayStart = dayjs().startOf('day');
  const end = selectedDate.isSame(todayStart, 'day') ? todayStart : selectedDayStart.add(1, 'day');
  if (viewMode === 'week') return { start: end.subtract(7, 'day'), end, days: 7 };
  return { start: end.subtract(30, 'day'), end, days: 30 };
};

const getViewStepDays = (viewMode: TimeViewMode) => {
  if (viewMode === 'week') return 7;
  if (viewMode === 'month') return 30;
  return 1;
};

export default function TimePage() {
  const [form] = Form.useForm();
  const [visible, setVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntryWithActivityType | null>(null);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [viewMode, setViewMode] = useState<TimeViewMode>('day');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [showAllRhythm, setShowAllRhythm] = useState(false);

  const activityRes = useActivityTypes(refreshKey);
  const { timeEntries, reQuery, loadMore, hasMore } = useTimeEntries();
  const analyzeRange = useMemo(() => getAnalyzeRange(selectedDate, viewMode), [selectedDate, viewMode]);
  const { data: analyzeData } = useTimeRangeAnalyze(analyzeRange.start, analyzeRange.end, refreshKey);

  const activityTypes = activityRes.activityTypes ?? [];
  const initialLoading = activityRes.activityTypes === undefined || timeEntries === undefined || analyzeData === null;
  const selectedActivity = selectedActivityId
    ? activityTypes.find((activityType) => activityType.id === selectedActivityId)
    : undefined;

  const filteredRecent = useMemo(() => {
    const list = timeEntries ?? [];
    if (!selectedActivityId) return list;
    return list.filter((entry) => entry.activityTypeId === selectedActivityId);
  }, [timeEntries, selectedActivityId]);

  const latestEndedAt = useMemo(() => {
    const list = timeEntries ?? [];
    if (list.length === 0) return null;
    return new Date(Math.max(...list.map((entry) => new Date(entry.endedAt).getTime())));
  }, [timeEntries]);

  const viewData = useMemo<TimeViewData | null>(() => {
    if (!analyzeData) return null;

    const selectedDayKey = selectedDate.format('YYYY-MM-DD');
    const selectedDay = analyzeData.dailySummaries.find((summary) => summary.date === selectedDayKey) ?? {
      date: selectedDayKey,
      minutes: 0,
      byActivity: {},
    };
    const selectedDayStart = selectedDate.startOf('day');
    const selectedDayEntryCounts = new Map<number, number>();
    analyzeData.timeEntries.forEach((entry) => {
      const endedAt = dayjs(entry.endedAt);
      if (endedAt.isSame(selectedDayStart, 'day')) {
        selectedDayEntryCounts.set(entry.activityTypeId, (selectedDayEntryCounts.get(entry.activityTypeId) ?? 0) + 1);
      }
    });

    if (viewMode === 'day') {
      return {
        totalMinutes: selectedDay.minutes,
        recordedDays: selectedDay.minutes > 0 ? 1 : 0,
        totalLabel: '当日记录时长',
        rangeLabel: selectedDate.format('YYYY 年 M 月 D 日'),
        chartTitle: '当日分布',
        chartHint: selectedDate.format('MM/DD'),
        activitySummaries: buildActivitySummaries({
          byActivity: selectedDay.byActivity,
          baseSummaries: analyzeData.activitySummaries,
          entryCounts: selectedDayEntryCounts,
        }),
        chartPoints: [{ ...selectedDay, label: selectedDate.format('MM/DD') }],
        rhythmSegments: analyzeData.rhythmSegments.filter((segment) => segment.date === selectedDayKey),
        sleepAverage: analyzeData.sleepSamples.find((sample) => sample.date === selectedDayKey)?.minutes ?? 0,
        stats: [
          { label: '活动数', value: String(Object.keys(selectedDay.byActivity).length) },
          { label: '开始', value: selectedDay.firstStartedAt ? dayjs(selectedDay.firstStartedAt).format('HH:mm') : '—' },
          { label: '结束', value: selectedDay.lastEndedAt ? dayjs(selectedDay.lastEndedAt).format('HH:mm') : '—' },
        ],
      };
    }

    const rangeEndLabel = analyzeRange.end.subtract(1, 'day');
    const sleepAverage = analyzeData.sleepSamples.length
      ? Math.round(analyzeData.sleepSamples.reduce((sum, item) => sum + item.minutes, 0) / analyzeData.sleepSamples.length)
      : 0;
    const divisor = Math.max(analyzeData.recordedDays, 1);
    const averageMinutes = Math.round(analyzeData.totalMinutes / divisor);

    return {
      totalMinutes: averageMinutes,
      recordedDays: analyzeData.recordedDays,
      totalLabel: viewMode === 'week' ? '近一周记录日均' : '近一月记录日均',
      rangeLabel: `${analyzeRange.start.format('M/D')} - ${rangeEndLabel.format('M/D')}`,
      chartTitle: '每日趋势',
      chartHint: analyzeData.recordedDays > 0 ? `记录日均 ${formatDuration(averageMinutes)}` : '暂无记录',
      activitySummaries: analyzeData.activitySummaries
        .map((summary) => ({
          ...summary,
          minutes: Math.round(summary.minutes / divisor),
        }))
        .filter((summary) => summary.minutes > 0),
      chartPoints: analyzeData.dailySummaries.map((summary) => ({
        ...summary,
        label: dayjs(summary.date).format('M/D'),
      })),
      rhythmSegments: [],
      sleepAverage,
      stats: [
        { label: '统计天数', value: String(analyzeRange.days) },
        { label: '记录天数', value: String(analyzeData.recordedDays) },
        { label: '区间总时长', value: analyzeData.totalMinutes ? formatDuration(analyzeData.totalMinutes) : '—' },
      ],
    };
  }, [analyzeData, analyzeRange, selectedDate, viewMode]);

  const changeSelectedDate = (date: dayjs.Dayjs) => {
    const today = dayjs();
    setSelectedDate(date.isAfter(today, 'day') ? today : date);
    setShowAllRhythm(false);
  };

  const openCreate = () => {
    const endedAt = dayjs().second(0).millisecond(0).toDate();
    const endedAtObj = dayjs(endedAt);
    const latestEnd = latestEndedAt ? dayjs(latestEndedAt).second(0).millisecond(0) : null;
    const startedAt = latestEnd && latestEnd.isBefore(endedAtObj)
      ? latestEnd.toDate()
      : endedAtObj.subtract(1, 'hour').toDate();
    setEditingEntry(null);
    form.resetFields();
    form.setFieldsValue({
      activityTypeId: activityTypes[0] ? [String(activityTypes[0].id)] : undefined,
      customActivityName: undefined,
      startedAt,
      endedAt,
      note: undefined,
    });
    setVisible(true);
  };

  const openEdit = (entry: TimeEntryWithActivityType) => {
    setEditingEntry(entry);
    form.resetFields();
    form.setFieldsValue({
      activityTypeId: [String(entry.activityTypeId)],
      customActivityName: undefined,
      startedAt: new Date(entry.startedAt),
      endedAt: new Date(entry.endedAt),
      note: entry.note ?? undefined,
    });
    setVisible(true);
  };

  const refreshAll = async () => {
    await reQuery();
    setRefreshKey((value) => value + 1);
  };

  const submitEntry = async (values: TimeEntryFormValues) => {
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

    if (editingEntry) {
      const [firstSegment, ...extraSegments] = segments;
      await post<ITimeEntryUpdateReq, ITimeEntryUpdateRes>('/api/time-entry/update', {
        id: editingEntry.id,
        activityTypeId: activityTypeIds[0],
        startedAt: firstSegment.startedAt.getTime(),
        endedAt: firstSegment.endedAt.getTime(),
        note: values.note,
      });

      for (const [index, segment] of extraSegments.entries()) {
        await post<ITimeEntryCreateReq, ITimeEntryCreateRes>('/api/time-entry/create', {
          activityTypeId: activityTypeIds[index + 1],
          startedAt: segment.startedAt.getTime(),
          endedAt: segment.endedAt.getTime(),
          note: values.note,
        });
      }
    } else {
      for (const [index, segment] of segments.entries()) {
        await post<ITimeEntryCreateReq, ITimeEntryCreateRes>('/api/time-entry/create', {
          activityTypeId: activityTypeIds[index],
          startedAt: segment.startedAt.getTime(),
          endedAt: segment.endedAt.getTime(),
          note: values.note,
        });
      }
    }

    await new Promise<void>((resolve) => {
      Toast.show({
        content: editingEntry ? '已更新' : '记录成功',
        afterClose: () => {
          setVisible(false);
          void refreshAll();
          resolve();
        },
      });
    });
  };

  return (
    <div className={styles.page}>
      <PullToRefresh onRefresh={refreshAll}>
        <TimeSummaryCard
          selectedDate={selectedDate}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onDateChange={changeSelectedDate}
          viewData={viewData}
        />

        {initialLoading ? (
          <LoadingState className={styles.pageLoading} label="时间加载中" />
        ) : (
          <>
            {analyzeData && viewData && viewData.activitySummaries.length > 0 && (
              <>
                <ActivityBreakdown
                  summaries={viewData.activitySummaries}
                  totalMinutes={viewData.totalMinutes}
                  selectedActivityId={selectedActivityId}
                  onSelect={setSelectedActivityId}
                />

                <div className={styles.sectionHeader}>
                  <span>{viewData.chartTitle}{selectedActivity ? ` · ${selectedActivity.name}` : ''}</span>
                  <span className={styles.sectionHint}>{viewData.chartHint}</span>
                </div>
                <div className={styles.chartCard}>
                  <DailyStackChart
                    points={viewData.chartPoints}
                    activities={viewData.activitySummaries}
                    selectedActivityId={selectedActivityId}
                  />
                </div>

                {viewMode === 'day' && viewData.rhythmSegments.length > 0 && (
                  <>
                    <div className={styles.sectionHeader}>
                      <span>24 小时节律{selectedActivity ? ` · ${selectedActivity.name}` : ''}</span>
                      <span className={styles.sectionHint}>{viewData.rangeLabel}</span>
                    </div>
                    <RhythmView
                      dailySummaries={analyzeData.dailySummaries}
                      rhythmSegments={viewData.rhythmSegments}
                      selectedActivityId={selectedActivityId}
                      showAll={showAllRhythm}
                    />
                  </>
                )}
              </>
            )}

            <div className={[styles.sectionHeader, styles.recentHeader].join(' ')}>
              <span>最近记录{selectedActivity ? ` · ${selectedActivity.name}` : ''}</span>
              {selectedActivity && (
                <button type="button" className={styles.linkBtn} onClick={() => setSelectedActivityId(null)}>
                  全部
                </button>
              )}
            </div>

            {filteredRecent.length > 0 ? (
              <GroupedList
                entries={filteredRecent}
                onEdit={openEdit}
                onDelete={async (id) => {
                  await post('/api/time-entry/delete', { ids: [id] });
                  Toast.show({ content: '删除成功', afterClose: () => void refreshAll() });
                }}
                hasMore={hasMore && !selectedActivityId}
                onLoadMore={loadMore}
              />
            ) : (
              <Empty
                style={{ padding: '64px 0' }}
                imageStyle={{ width: 128 }}
                description={selectedActivity ? `${selectedActivity.name} 暂无记录` : '暂无记录'}
              />
            )}
          </>
        )}

        <div className={styles.endSpacer} />
      </PullToRefresh>

      <TimeEntryFloatingButton
        initialPositionBottom="calc(100px + max(env(safe-area-inset-bottom), 0px))"
        activityTypes={activityTypes}
        onClick={openCreate}
        onQuickCreateSuccess={refreshAll}
      />

      <TimeEntryModal
        visible={visible}
        form={form}
        title={editingEntry ? '编辑时间记录' : '新增时间记录'}
        submitText={editingEntry ? '保存' : '提交'}
        activityTypes={activityTypes}
        onClose={() => setVisible(false)}
        onFinish={submitEntry}
      />
    </div>
  );
}

const TimeSummaryCard = ({
  selectedDate,
  viewMode,
  onViewModeChange,
  onDateChange,
  viewData,
}: {
  selectedDate: dayjs.Dayjs;
  viewMode: TimeViewMode;
  onViewModeChange: (mode: TimeViewMode) => void;
  onDateChange: (date: dayjs.Dayjs) => void;
  viewData: TimeViewData | null;
}) => {
  const stepDays = getViewStepDays(viewMode);
  const isCurrentPeriod = selectedDate.isSame(dayjs(), 'day');
  const previousDate = selectedDate.subtract(stepDays, 'day');
  const nextDate = selectedDate.add(stepDays, 'day');

  return (
    <div className={styles.summaryCard}>
      <Selector
        className={styles.viewModeSelector}
        columns={3}
        options={VIEW_MODE_OPTIONS}
        value={[viewMode]}
        onChange={(value) => {
          const nextMode = value[0] as TimeViewMode | undefined;
          if (nextMode) onViewModeChange(nextMode);
        }}
      />

      <div className={styles.summaryHeader}>
        <button type="button" aria-label="上一段" className={styles.navBtn} onClick={() => onDateChange(previousDate)}>
          <LeftOutline />
        </button>
        <div className={styles.monthLabel}>
          {viewData?.rangeLabel ?? selectedDate.format('YYYY 年 M 月 D 日')}
          {isCurrentPeriod && <span className={styles.monthTag}>今天</span>}
        </div>
        <button
          type="button"
          aria-label="下一段"
          className={styles.navBtn}
          disabled={isCurrentPeriod}
          onClick={() => onDateChange(nextDate)}
        >
          <RightOutline />
        </button>
      </div>

      <div className={styles.totalLabel}>{viewData?.totalLabel ?? '记录时长'}</div>
      <div className={styles.totalValue}>{formatDuration(viewData?.totalMinutes ?? 0)}</div>
      <div className={styles.statGrid}>
        {(viewData?.stats ?? [
          { label: '活动数', value: '—' },
          { label: '开始', value: '—' },
          { label: '结束', value: '—' },
        ]).map((stat) => (
          <SummaryStat key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>
    </div>
  );
};

const SummaryStat = ({ label, value }: { label: string; value: string }) => (
  <div className={styles.statItem}>
    <div className={styles.statValue}>{value}</div>
    <div className={styles.statLabel}>{label}</div>
  </div>
);

const ActivityBreakdown = ({
  summaries,
  totalMinutes,
  selectedActivityId,
  onSelect,
}: {
  summaries: ITimeActivitySummary[];
  totalMinutes: number;
  selectedActivityId: number | null;
  onSelect: (id: number | null) => void;
}) => (
  <div className={styles.breakdownWrap}>
    <div className={styles.breakdownTitle}>
      <span>活动分布</span>
      <span>点击筛选</span>
    </div>
    <div className={styles.breakdownScroller}>
      <button
        type="button"
        className={[styles.activityCard, !selectedActivityId ? styles.activityCardActive : ''].join(' ')}
        onClick={() => onSelect(null)}
      >
        <div className={styles.activityName}>全部</div>
        <div className={styles.activityTime}>{formatDuration(totalMinutes)}</div>
        <div className={styles.barTrack}><span style={{ width: '100%', background: PALETTE.text }} /></div>
      </button>
      {summaries.map((summary) => {
        const percent = totalMinutes > 0 ? (summary.minutes / totalMinutes) * 100 : 0;
        return (
          <button
            key={summary.activityTypeId}
            type="button"
            className={[styles.activityCard, selectedActivityId === summary.activityTypeId ? styles.activityCardActive : ''].join(' ')}
            onClick={() => onSelect(selectedActivityId === summary.activityTypeId ? null : summary.activityTypeId)}
          >
            <div className={styles.activityNameRow}>
              <span className={styles.activityDot} style={{ background: summary.color }} />
              <span className={styles.activityName}>{summary.name}</span>
            </div>
            <div className={styles.activityTime}>{formatDuration(summary.minutes)}</div>
            <div className={styles.activityMeta}>{percent.toFixed(0)}% · {summary.count} 次</div>
            <div className={styles.barTrack}><span style={{ width: `${percent}%`, background: summary.color }} /></div>
          </button>
        );
      })}
    </div>
  </div>
);

const DailyStackChart = ({
  points,
  activities,
  selectedActivityId,
}: {
  points: TimeChartPoint[];
  activities: ITimeActivitySummary[];
  selectedActivityId: number | null;
}) => {
  const option = useMemo(() => {
    const visibleActivities = selectedActivityId
      ? activities.filter((activity) => activity.activityTypeId === selectedActivityId)
      : activities;
    const labels = points.map((item) => item.label);

    return {
      color: visibleActivities.map((activity) => activity.color),
      grid: { left: 34, right: 12, top: 28, bottom: 52 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: number) => formatDuration(Math.round(value * 60)),
      },
      legend: {
        type: 'scroll',
        bottom: 6,
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: PALETTE.textSub, fontSize: 10 },
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: PALETTE.border } },
        axisLabel: { color: PALETTE.textMuted, fontSize: 10, interval: labels.length > 20 ? 2 : 1 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: PALETTE.textMuted, fontSize: 10, formatter: '{value}h' },
        splitLine: { lineStyle: { color: PALETTE.border, type: 'dashed' } },
      },
      series: visibleActivities.map((activity) => ({
        name: activity.name,
        type: 'bar',
        stack: 'time',
        barMaxWidth: 14,
        emphasis: { focus: 'series' },
        data: points.map((point) => Number(((point.byActivity[String(activity.activityTypeId)] ?? 0) / 60).toFixed(2))),
      })),
    };
  }, [activities, points, selectedActivityId]);

  return <ReactECharts option={option} style={{ width: '100%', height: 240 }} notMerge lazyUpdate />;
};

const RhythmView = ({
  dailySummaries,
  rhythmSegments,
  selectedActivityId,
  showAll,
}: {
  dailySummaries: AnalyzeData['dailySummaries'];
  rhythmSegments: AnalyzeData['rhythmSegments'];
  selectedActivityId: number | null;
  showAll: boolean;
}) => {
  const segmentsByDate = useMemo(() => {
    const map = new Map<string, typeof rhythmSegments>();
    rhythmSegments.forEach((segment) => {
      if (selectedActivityId && segment.activityTypeId !== selectedActivityId) return;
      const current = map.get(segment.date) ?? [];
      current.push(segment);
      map.set(segment.date, current);
    });
    return map;
  }, [rhythmSegments, selectedActivityId]);
  const visibleDays = dailySummaries.filter((day) => (segmentsByDate.get(day.date)?.length ?? 0) > 0);
  const displayDays = showAll ? visibleDays : visibleDays.slice(-7);

  if (visibleDays.length === 0) return null;

  return (
    <div className={styles.rhythmCard}>
      <div className={styles.timeAxis}>
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
      <div className={styles.rhythmRows}>
        {displayDays.map((day) => {
          const segments = segmentsByDate.get(day.date) ?? [];
          return (
            <div key={day.date} className={styles.rhythmRow}>
              <div className={styles.rhythmDate}>{dayjs(day.date).format('MM/DD')}</div>
              <div className={styles.rhythmTrack}>
                {segments.map((segment, index) => (
                  <span
                    key={`${segment.activityTypeId}-${segment.startMinute}-${segment.endMinute}-${index}`}
                    className={styles.rhythmSegment}
                    title={`${segment.name} ${formatDuration(segment.minutes)}`}
                    style={{
                      left: `${(segment.startMinute / 1440) * 100}%`,
                      width: `${Math.max(((segment.endMinute - segment.startMinute) / 1440) * 100, 0.6)}%`,
                      background: segment.color,
                    }}
                  />
                ))}
              </div>
              <div className={styles.rhythmTotal}>{formatHours(day.minutes)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
        <div key={group.date} className={styles.group}>
          <div className={styles.groupHeader}>
            <div>
              <span className={styles.groupDate}>{dayjs(group.date).format('MM月DD日')}</span>
              <span className={styles.groupWeekday}>{dayjs(group.date).format('ddd')}</span>
            </div>
            <span className={styles.groupTotal}>{formatDuration(group.total)}</span>
          </div>
          <List>
            {group.items.map((entry) => (
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
                    <div className={styles.iconWrap} style={{ background: entry.activityType.color + '22', color: entry.activityType.color }}>
                      <ClockCircleOutline />
                    </div>
                  }
                  description={
                    <span className={styles.itemDesc}>
                      {dayjs(entry.startedAt).format('HH:mm')} - {dayjs(entry.endedAt).format('HH:mm')}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </span>
                  }
                  extra={<span className={styles.itemAmount}>{formatDuration(minutesBetween(entry.startedAt, entry.endedAt))}</span>}
                  onClick={() => onEdit(entry)}
                >
                  <span className={styles.itemTitle}>{entry.activityType.name}</span>
                </List.Item>
              </SwipeAction>
            ))}
          </List>
        </div>
      ))}

      {hasMore && (
        <div className={styles.loadMore}>
          <Button size="small" fill="none" onClick={() => void onLoadMore()}>
            加载更多
          </Button>
        </div>
      )}
      {!hasMore && entries.length > 0 && <div className={styles.endText}>— 没有更多了 —</div>}
    </div>
  );
};
