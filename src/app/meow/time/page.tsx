'use client';

import {
  Button,
  DatePicker,
  DatePickerRef,
  Empty,
  FloatingBubble,
  Form,
  Input,
  List,
  Modal,
  PullToRefresh,
  Selector,
  SwipeAction,
  Toast,
} from 'antd-mobile';
import {
  AddCircleOutline,
  ClockCircleOutline,
  LeftOutline,
  RightOutline,
} from 'antd-mobile-icons';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import { RefObject, useMemo, useState } from 'react';
import { post } from '@libs/fetch';
import {
  IActivityTypeCreateReq,
  IActivityTypeCreateRes,
  ITimeActivitySummary,
  ITimeEntryCreateReq,
  ITimeEntryCreateRes,
  ITimeEntryUpdateReq,
  ITimeEntryUpdateRes,
  TimeEntryWithActivityType,
} from '@dtos/meow';
import { PALETTE } from '@styles/theme';
import { formatDuration, formatHours, minutesBetween } from '@utils/time';
import { useActivityTypes, useTimeEntries, useTimeMonthAnalyze } from '@utils/time-entry';
import { TopLoading } from '@components/loading';
import styles from './time.module.scss';

type TimeFormValues = {
  activityTypeId: string[];
  customActivityName?: string;
  startedAt: Date;
  endedAt: Date;
  note?: string;
};

type AnalyzeData = NonNullable<ReturnType<typeof useTimeMonthAnalyze>['data']>;

export default function TimePage() {
  const [form] = Form.useForm();
  const [visible, setVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntryWithActivityType | null>(null);
  const [month, setMonth] = useState(dayjs());
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [showAllRhythm, setShowAllRhythm] = useState(false);

  const activityRes = useActivityTypes(refreshKey);
  const { timeEntries, reQuery, loadMore, hasMore } = useTimeEntries();
  const { data: monthData } = useTimeMonthAnalyze(month, refreshKey);

  const activityTypes = activityRes.activityTypes ?? [];
  const selectedActivity = selectedActivityId
    ? activityTypes.find((activityType) => activityType.id === selectedActivityId)
    : undefined;

  const filteredRecent = useMemo(() => {
    const list = timeEntries ?? [];
    if (!selectedActivityId) return list;
    return list.filter((entry) => entry.activityTypeId === selectedActivityId);
  }, [timeEntries, selectedActivityId]);

  const selectorOptions = useMemo(
    () =>
      activityTypes.map((activityType) => ({
        value: String(activityType.id),
        label: (
          <span className={styles.activityOption}>
            <span className={styles.optionSwatch} style={{ background: activityType.color }} />
            <span>{activityType.name}</span>
          </span>
        ),
      })),
    [activityTypes]
  );

  const latestEndedAt = useMemo(() => {
    const list = timeEntries ?? [];
    if (list.length === 0) return null;
    return new Date(Math.max(...list.map((entry) => new Date(entry.endedAt).getTime())));
  }, [timeEntries]);

  if (!activityRes.activityTypes || timeEntries === undefined) return <TopLoading />;

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

  const submitEntry = async (values: TimeFormValues) => {
    let activityTypeId = Number(values.activityTypeId?.[0]);
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
      activityTypeId = res.activityType.id;
    }

    if (!activityTypeId) {
      Toast.show({ content: '请选择活动或输入新项目' });
      return;
    }

    const payload = {
      activityTypeId,
      startedAt: dayjs(values.startedAt).valueOf(),
      endedAt: dayjs(values.endedAt).valueOf(),
      note: values.note,
    };

    if (editingEntry) {
      await post<ITimeEntryUpdateReq, ITimeEntryUpdateRes>('/api/time-entry/update', {
        id: editingEntry.id,
        ...payload,
      });
    } else {
      await post<ITimeEntryCreateReq, ITimeEntryCreateRes>('/api/time-entry/create', payload);
    }

    Toast.show({
      content: editingEntry ? '已更新' : '记录成功',
      afterClose: () => {
        setVisible(false);
        void refreshAll();
      },
    });
  };

  return (
    <div className={styles.page}>
      <PullToRefresh onRefresh={refreshAll}>
        <TimeSummaryCard month={month} onMonthChange={setMonth} data={monthData} />

        {monthData && monthData.activitySummaries.length > 0 && (
          <>
            <ActivityBreakdown
              summaries={monthData.activitySummaries}
              totalMinutes={monthData.totalMinutes}
              selectedActivityId={selectedActivityId}
              onSelect={setSelectedActivityId}
            />

            <div className={styles.sectionHeader}>
              <span>每日趋势{selectedActivity ? ` · ${selectedActivity.name}` : ''}</span>
              <span className={styles.sectionHint}>{month.format('YYYY 年 M 月')}</span>
            </div>
            <div className={styles.chartCard}>
              <DailyStackChart
                data={monthData}
                activities={monthData.activitySummaries}
                selectedActivityId={selectedActivityId}
              />
            </div>

            <div className={styles.sectionHeader}>
              <span>24 小时节律{selectedActivity ? ` · ${selectedActivity.name}` : ''}</span>
              {monthData.recordedDays > 7 ? (
                <button type="button" className={styles.linkBtn} onClick={() => setShowAllRhythm((value) => !value)}>
                  {showAllRhythm ? '收起' : '展开全部'}
                </button>
              ) : (
                <span className={styles.sectionHint}>{monthData.recordedDays} 天</span>
              )}
            </div>
            <RhythmView data={monthData} selectedActivityId={selectedActivityId} showAll={showAllRhythm} />
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

        <div className={styles.endSpacer} />
      </PullToRefresh>

      <FloatingBubble
        style={{
          '--initial-position-bottom': '100px',
          '--initial-position-right': '24px',
          '--edge-distance': '44px',
          '--background': 'var(--meow-primary)',
        }}
        onClick={openCreate}
      >
        <AddCircleOutline fontSize={32} />
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
                {editingEntry ? '保存' : '提交'}
              </Button>
            }
            style={{ marginTop: '20px' }}
            onFinish={submitEntry}
          >
            <div className={styles.modalTitle}>{editingEntry ? '编辑时间记录' : '新增时间记录'}</div>
            <Form.Item name="activityTypeId" className={styles.activityField} rules={[{ required: true, message: '请选择活动' }]}>
              <Selector className={styles.activitySelector} columns={2} options={selectorOptions} />
            </Form.Item>
            <Form.Item name="customActivityName" label="新项目">
              <Input placeholder="例如：冥想、做饭、画画" />
            </Form.Item>
            <Form.Item
              name="startedAt"
              label="开始"
              trigger="onConfirm"
              rules={[{ required: true, message: '请选择开始时间' }]}
              onClick={(_, datePickerRef: RefObject<DatePickerRef>) => datePickerRef.current?.open()}
            >
              <DatePicker precision="minute">
                {(value) => (value ? dayjs(value).format('YYYY/MM/DD HH:mm') : '请选择时间')}
              </DatePicker>
            </Form.Item>
            <Form.Item
              name="endedAt"
              label="结束"
              trigger="onConfirm"
              rules={[{ required: true, message: '请选择结束时间' }]}
              onClick={(_, datePickerRef: RefObject<DatePickerRef>) => datePickerRef.current?.open()}
            >
              <DatePicker precision="minute">
                {(value) => (value ? dayjs(value).format('YYYY/MM/DD HH:mm') : '请选择时间')}
              </DatePicker>
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.startedAt !== next.startedAt || prev.endedAt !== next.endedAt}>
              {({ getFieldValue }) => {
                const startedAt = getFieldValue('startedAt');
                const endedAt = getFieldValue('endedAt');
                const minutes = startedAt && endedAt ? minutesBetween(startedAt, endedAt) : 0;
                return minutes > 0 ? <div className={styles.durationHint}>时长 {formatDuration(minutes)}</div> : null;
              }}
            </Form.Item>
            <Form.Item name="note" label="备注">
              <Input placeholder="可选" />
            </Form.Item>
          </Form>
        }
      />
    </div>
  );
}

const TimeSummaryCard = ({
  month,
  onMonthChange,
  data,
}: {
  month: dayjs.Dayjs;
  onMonthChange: (month: dayjs.Dayjs) => void;
  data: ReturnType<typeof useTimeMonthAnalyze>['data'];
}) => {
  const daysInMonth = month.daysInMonth();
  const sleepAverage = data?.sleepSamples.length
    ? Math.round(data.sleepSamples.reduce((sum, item) => sum + item.minutes, 0) / data.sleepSamples.length)
    : 0;
  const activeDaysAverage = data && data.recordedDays > 0 ? Math.round(data.totalMinutes / data.recordedDays) : 0;
  const isCurrentMonth = month.isSame(dayjs(), 'month');

  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryHeader}>
        <button type="button" aria-label="上个月" className={styles.navBtn} onClick={() => onMonthChange(month.subtract(1, 'month'))}>
          <LeftOutline />
        </button>
        <div className={styles.monthLabel}>
          {month.format('YYYY 年 M 月')}
          {isCurrentMonth && <span className={styles.monthTag}>本月</span>}
        </div>
        <button
          type="button"
          aria-label="下个月"
          className={styles.navBtn}
          disabled={isCurrentMonth}
          onClick={() => onMonthChange(month.add(1, 'month'))}
        >
          <RightOutline />
        </button>
      </div>

      <div className={styles.totalLabel}>本月记录时长</div>
      <div className={styles.totalValue}>{formatDuration(data?.totalMinutes ?? 0)}</div>
      <div className={styles.statGrid}>
        <SummaryStat label="记录天数" value={`${data?.recordedDays ?? 0}/${daysInMonth}`} />
        <SummaryStat label="记录日均" value={activeDaysAverage ? formatDuration(activeDaysAverage) : '—'} />
        <SummaryStat label="睡眠均值" value={sleepAverage ? formatDuration(sleepAverage) : '—'} />
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
  data,
  activities,
  selectedActivityId,
}: {
  data: AnalyzeData;
  activities: ITimeActivitySummary[];
  selectedActivityId: number | null;
}) => {
  const option = useMemo(() => {
    const visibleActivities = selectedActivityId
      ? activities.filter((activity) => activity.activityTypeId === selectedActivityId)
      : activities;
    const labels = data.dailySummaries.map((item) => String(dayjs(item.date).date()));

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
        data: data.dailySummaries.map((day) => Number(((day.byActivity[String(activity.activityTypeId)] ?? 0) / 60).toFixed(2))),
      })),
    };
  }, [activities, data, selectedActivityId]);

  return <ReactECharts option={option} style={{ width: '100%', height: 240 }} notMerge lazyUpdate />;
};

const RhythmView = ({
  data,
  selectedActivityId,
  showAll,
}: {
  data: AnalyzeData;
  selectedActivityId: number | null;
  showAll: boolean;
}) => {
  const segmentsByDate = useMemo(() => {
    const map = new Map<string, typeof data.rhythmSegments>();
    data.rhythmSegments.forEach((segment) => {
      if (selectedActivityId && segment.activityTypeId !== selectedActivityId) return;
      const current = map.get(segment.date) ?? [];
      current.push(segment);
      map.set(segment.date, current);
    });
    return map;
  }, [data.rhythmSegments, selectedActivityId]);
  const visibleDays = data.dailySummaries.filter((day) => (segmentsByDate.get(day.date)?.length ?? 0) > 0);
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
      const key = dayjs(entry.startedAt).format('YYYY-MM-DD');
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
          <List className={styles.list}>
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
