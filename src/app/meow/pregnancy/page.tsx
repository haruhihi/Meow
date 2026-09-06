'use client';

import {
  Button,
  DatePicker,
  Dialog,
  Empty,
  Form,
  Modal,
  Picker,
  PullToRefresh,
  SwipeAction,
  TextArea,
  Toast,
} from 'antd-mobile';
import type { DatePickerRef } from 'antd-mobile';
import {
  AddCircleOutline,
  EditSOutline,
  LeftOutline,
  RightOutline,
} from 'antd-mobile-icons';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { PregnancyCautionItem } from '@dtos/meow';
import { LoadingState } from '@components/loading';
import { usePregnancyOverview } from '@utils/pregnancy-data';
import {
  PREGNANCY_CYCLE_COUNT,
  clampPregnancyDate,
  formatPregnancyMonthDay,
  getPregnancyAge,
  getPregnancyCycleDates,
  getPregnancyCycleIndex,
  getPregnancyCycleLabel,
  getPregnancyEndDate,
  getPregnancyWeekRows,
  getPregnancyWeekdayHeaders,
  getPregnancyWeekdayLabel,
  pregnancyDateFromLocalDate,
  pregnancyDateToLocalDate,
} from '@utils/pregnancy';
import styles from './pregnancy.module.scss';

type CautionFormValues = {
  startDate: Date;
  endDate: Date;
  content: string;
};

const CYCLE_OPTIONS = Array.from({ length: PREGNANCY_CYCLE_COUNT }, (_, cycleIndex) => ({
  label: getPregnancyCycleLabel(cycleIndex),
  value: String(cycleIndex),
}));

const getRequestError = (error: unknown) => (
  (error as { result?: string })?.result ?? (error instanceof Error ? error.message : '操作失败，请重试')
);

const formatFullDate = (dateKey: string) => dayjs(pregnancyDateToLocalDate(dateKey)).format('YYYY年M月D日');

export default function PregnancyPage() {
  const pregnancy = usePregnancyOverview();
  const [cautionForm] = Form.useForm<CautionFormValues>();
  const [cycleIndex, setCycleIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [cyclePickerVisible, setCyclePickerVisible] = useState(false);
  const [profilePickerVisible, setProfilePickerVisible] = useState(false);
  const [cautionVisible, setCautionVisible] = useState(false);
  const [editingCaution, setEditingCaution] = useState<PregnancyCautionItem | null>(null);
  const [cautionSaving, setCautionSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const initializedStartDateRef = useRef<string | null>(null);

  const profile = pregnancy.data?.profile;
  const cautions = pregnancy.data?.cautions ?? [];
  const today = pregnancyDateFromLocalDate(new Date());

  useEffect(() => {
    if (!profile || initializedStartDateRef.current === profile.startDate) return;
    initializedStartDateRef.current = profile.startDate;
    const nextSelectedDate = clampPregnancyDate(profile.startDate, today);
    setSelectedDate(nextSelectedDate);
    setCycleIndex(getPregnancyCycleIndex(profile.startDate, nextSelectedDate));
  }, [profile, today]);

  const startDate = profile?.startDate ?? null;
  const endDate = startDate ? getPregnancyEndDate(startDate) : null;
  const cycleDates = useMemo(
    () => startDate ? getPregnancyCycleDates(startDate, cycleIndex) : [],
    [cycleIndex, startDate]
  );
  const weekRows = useMemo(
    () => startDate ? getPregnancyWeekRows(startDate, cycleIndex) : [],
    [cycleIndex, startDate]
  );
  const weekdayHeaders = useMemo(
    () => cycleDates[0] ? getPregnancyWeekdayHeaders(cycleDates[0]) : [],
    [cycleDates]
  );
  const selectedCautions = useMemo(
    () => selectedDate
      ? cautions.filter((caution) => caution.startDate <= selectedDate && caution.endDate >= selectedDate)
      : [],
    [cautions, selectedDate]
  );
  const selectedAge = startDate && selectedDate ? getPregnancyAge(startDate, selectedDate) : null;

  const changeCycle = (nextCycleIndex: number) => {
    if (!startDate) return;
    const safeCycleIndex = Math.min(PREGNANCY_CYCLE_COUNT - 1, Math.max(0, nextCycleIndex));
    const nextCycleDates = getPregnancyCycleDates(startDate, safeCycleIndex);
    setCycleIndex(safeCycleIndex);
    if (!selectedDate || selectedDate < nextCycleDates[0] || selectedDate > nextCycleDates[nextCycleDates.length - 1]) {
      setSelectedDate(nextCycleDates[0]);
    }
  };

  const refresh = async () => {
    try {
      await pregnancy.reQuery();
    } catch (error) {
      Toast.show({ content: getRequestError(error) });
    }
  };

  const openCreateCaution = () => {
    if (!selectedDate) return;
    setEditingCaution(null);
    cautionForm.resetFields();
    const date = pregnancyDateToLocalDate(selectedDate);
    cautionForm.setFieldsValue({ startDate: date, endDate: date, content: '' });
    setCautionVisible(true);
  };

  const openEditCaution = (caution: PregnancyCautionItem) => {
    setEditingCaution(caution);
    cautionForm.resetFields();
    cautionForm.setFieldsValue({
      startDate: pregnancyDateToLocalDate(caution.startDate),
      endDate: pregnancyDateToLocalDate(caution.endDate),
      content: caution.content,
    });
    setCautionVisible(true);
  };

  const saveCaution = async (values: CautionFormValues) => {
    const nextStartDate = pregnancyDateFromLocalDate(values.startDate);
    const nextEndDate = pregnancyDateFromLocalDate(values.endDate);
    if (nextEndDate < nextStartDate) {
      Toast.show({ content: '结束日期不能早于开始日期' });
      return;
    }

    try {
      setCautionSaving(true);
      await pregnancy.saveCaution({
        ...(editingCaution ? { id: editingCaution.id } : {}),
        startDate: nextStartDate,
        endDate: nextEndDate,
        content: values.content,
      });
      setCautionVisible(false);
      Toast.show({ content: editingCaution ? '注意事项已更新' : '注意事项已添加' });
    } catch (error) {
      Toast.show({ content: getRequestError(error) });
    } finally {
      setCautionSaving(false);
    }
  };

  const deleteCaution = async (caution: PregnancyCautionItem) => {
    const confirmed = await Dialog.confirm({
      title: '删除注意事项',
      content: '删除后无法恢复，确定继续吗？',
    });
    if (!confirmed) return;

    try {
      await pregnancy.deleteCaution({ id: caution.id });
      Toast.show({ content: '注意事项已删除' });
    } catch (error) {
      Toast.show({ content: getRequestError(error) });
    }
  };

  const updateStartDate = async (date: Date) => {
    if (!profile) return;
    const nextStartDate = pregnancyDateFromLocalDate(date);
    setProfilePickerVisible(false);
    if (nextStartDate === profile.startDate) return;
    const confirmed = await Dialog.confirm({
      title: '修改起始日期',
      content: '历史注意事项仍保留在原自然日期，只会重新计算所属周期。',
      confirmText: '确认修改',
    });
    if (!confirmed) return;

    try {
      setProfileSaving(true);
      initializedStartDateRef.current = null;
      await pregnancy.updateProfile({
        startDate: nextStartDate,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      });
      Toast.show({ content: '起始日期已更新' });
    } catch (error) {
      initializedStartDateRef.current = profile.startDate;
      Toast.show({ content: getRequestError(error) });
    } finally {
      setProfileSaving(false);
    }
  };

  if (pregnancy.loading && !pregnancy.data) {
    return (
      <div className={styles.page}>
        <LoadingState className={styles.pageLoading} label="日历数据加载中" />
      </div>
    );
  }

  if (!pregnancy.data || !profile || !startDate || !endDate || !selectedDate) {
    return (
      <div className={styles.page}>
        <div className={styles.loadError}>
          <Empty description={pregnancy.error ?? '日历数据暂时无法加载'} />
          <Button color="primary" onClick={() => void refresh()}>重新加载</Button>
        </div>
        <div className={styles.endSpacer} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PullToRefresh onRefresh={refresh}>
        <header className={styles.stickyHeader}>
          <div className={styles.cycleNavigation}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="上一个四周周期"
              disabled={cycleIndex === 0}
              onClick={() => changeCycle(cycleIndex - 1)}
            >
              <LeftOutline />
            </button>
            <button type="button" className={styles.cycleButton} onClick={() => setCyclePickerVisible(true)}>
              <span className={styles.buttonContent}>{getPregnancyCycleLabel(cycleIndex)}</span>
              <small>{formatPregnancyMonthDay(cycleDates[0])}–{formatPregnancyMonthDay(cycleDates[cycleDates.length - 1])}</small>
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="下一个四周周期"
              disabled={cycleIndex === PREGNANCY_CYCLE_COUNT - 1}
              onClick={() => changeCycle(cycleIndex + 1)}
            >
              <RightOutline />
            </button>
          </div>
          <button
            type="button"
            className={styles.startDateButton}
            disabled={profileSaving}
            onClick={() => setProfilePickerVisible(true)}
          >
            <span className={styles.buttonContent}>起始日期 {profile.startDate.replaceAll('-', '/')}</span>
            <EditSOutline />
          </button>
        </header>

        <section className={styles.calendarCard} aria-label={`${getPregnancyCycleLabel(cycleIndex)}日历`}>
          <div className={styles.weekHeader}>
            <span />
            {weekdayHeaders.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
          </div>
          <div className={styles.weekRows}>
            {weekRows.map((row) => (
              <div key={row.displayWeek} className={styles.weekRow}>
                <span className={styles.weekLabel}>{row.displayWeek}周</span>
                {row.dates.map((date) => {
                  const hasCaution = cautions.some((caution) => caution.startDate <= date && caution.endDate >= date);
                  const stateClass = hasCaution ? styles.dateCaution : '';
                  return (
                    <button
                      key={date}
                      type="button"
                      className={[
                        styles.dateCell,
                        stateClass,
                        date === selectedDate ? styles.dateSelected : '',
                        date === today ? styles.dateToday : '',
                      ].filter(Boolean).join(' ')}
                      aria-pressed={date === selectedDate}
                      aria-label={`${formatFullDate(date)}${hasCaution ? '，有注意事项' : ''}`}
                      onClick={() => setSelectedDate(date)}
                    >
                      <span>{formatPregnancyMonthDay(date)}</span>
                      {date === today && <small>今</small>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className={styles.legend}>
            <span><i className={styles.legendCaution} />注意事项</span>
          </div>
        </section>

        <section className={styles.selectedDayCard}>
          <div>
            <div className={styles.selectedDateTitle}>{formatFullDate(selectedDate)} · {getPregnancyWeekdayLabel(selectedDate)}</div>
            <div className={styles.selectedDateMeta}>{selectedAge?.label} · 第{selectedAge?.displayWeek}周</div>
          </div>
        </section>

        <section className={styles.detailSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>注意事项</h2>
              <span>{selectedCautions.length} 项</span>
            </div>
            <Button size="small" fill="outline" color="primary" onClick={openCreateCaution}>
              <span className={styles.buttonContent}><AddCircleOutline />增加事项</span>
            </Button>
          </div>
          {selectedCautions.length > 0 ? (
            <div className={styles.itemList}>
              {selectedCautions.map((caution) => (
                <SwipeAction
                  key={caution.id}
                  rightActions={[
                    { key: 'edit', text: '编辑', color: 'primary', onClick: () => openEditCaution(caution) },
                    { key: 'delete', text: '删除', color: 'danger', onClick: () => void deleteCaution(caution) },
                  ]}
                >
                  <button type="button" className={styles.cautionItem} onClick={() => openEditCaution(caution)}>
                    <span className={styles.itemRange}>{formatPregnancyMonthDay(caution.startDate)}–{formatPregnancyMonthDay(caution.endDate)}</span>
                    <span className={styles.itemContent}>{caution.content}</span>
                  </button>
                </SwipeAction>
              ))}
            </div>
          ) : (
            <div className={styles.compactEmpty}>当天没有注意事项</div>
          )}
        </section>

        <div className={styles.endSpacer} />
      </PullToRefresh>

      <Picker
        title="切换周期"
        columns={[CYCLE_OPTIONS]}
        visible={cyclePickerVisible}
        value={[String(cycleIndex)]}
        onClose={() => setCyclePickerVisible(false)}
        onConfirm={(value) => {
          const nextCycleIndex = Number(value[0]);
          if (Number.isInteger(nextCycleIndex)) changeCycle(nextCycleIndex);
          setCyclePickerVisible(false);
        }}
      />

      <DatePicker
        title="修改起始日期"
        precision="day"
        visible={profilePickerVisible}
        value={pregnancyDateToLocalDate(profile.startDate)}
        max={new Date()}
        onClose={() => setProfilePickerVisible(false)}
        onConfirm={(date) => void updateStartDate(date)}
      />

      <Modal
        className={styles.formModal}
        visible={cautionVisible}
        closeOnMaskClick={!cautionSaving}
        showCloseButton
        onClose={() => {
          if (!cautionSaving) setCautionVisible(false);
        }}
        content={
          <Form
            form={cautionForm}
            layout="horizontal"
            className={styles.entryForm}
            footer={
              <Button block type="submit" color="primary" size="large" loading={cautionSaving} disabled={cautionSaving}>
                {editingCaution ? '保存修改' : '添加事项'}
              </Button>
            }
            onFinish={saveCaution}
          >
            <div className={styles.modalTitle}>{editingCaution ? '编辑注意事项' : '增加注意事项'}</div>
            <Form.Item
              name="startDate"
              label="开始"
              trigger="onConfirm"
              rules={[{ required: true, message: '请选择开始日期' }]}
              onClick={(_, ref: RefObject<DatePickerRef>) => ref.current?.open()}
            >
              <DatePicker precision="day" min={pregnancyDateToLocalDate(startDate)} max={pregnancyDateToLocalDate(endDate)}>
                {(value) => value ? dayjs(value).format('YYYY/MM/DD') : '请选择'}
              </DatePicker>
            </Form.Item>
            <Form.Item
              name="endDate"
              label="结束"
              trigger="onConfirm"
              rules={[{ required: true, message: '请选择结束日期' }]}
              onClick={(_, ref: RefObject<DatePickerRef>) => ref.current?.open()}
            >
              <DatePicker precision="day" min={pregnancyDateToLocalDate(startDate)} max={pregnancyDateToLocalDate(endDate)}>
                {(value) => value ? dayjs(value).format('YYYY/MM/DD') : '请选择'}
              </DatePicker>
            </Form.Item>
            <Form.Item name="content" label="注意" rules={[{ required: true, message: '请填写注意事项' }]}>
              <TextArea rows={5} maxLength={20000} showCount placeholder="例如：避免生食，按时补充叶酸，预约产检……" />
            </Form.Item>
          </Form>
        }
      />

      {pregnancy.refreshing && <div className={styles.refreshHint}>正在更新…</div>}
    </div>
  );
}
