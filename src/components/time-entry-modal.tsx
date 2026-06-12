'use client';

import {
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
} from 'antd-mobile';
import type { DatePickerRef } from 'antd-mobile';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { PLACEHOLDER_ACTIVITY_NAME } from '@utils/time-activity';
import { formatDuration, minutesBetween } from '@utils/time';
import styles from './time-entry-modal.module.scss';

export type TimeEntryFormValues = {
  activityTypeId?: string[];
  customActivityName?: string;
  startedAt: Date;
  endedAt: Date;
  note?: string;
};

type ActivityTypeOption = {
  id: number;
  name: string;
  color: string;
};

type TimeEntryFormInstance = ReturnType<typeof Form.useForm>[0];

type TimeEntryModalProps = {
  visible: boolean;
  form: TimeEntryFormInstance;
  title: string;
  submitText: string;
  activityTypes: ActivityTypeOption[];
  onClose: () => void;
  onFinish: (values: TimeEntryFormValues) => void | Promise<void>;
};

const START_TIME_SHORTCUTS = [
  { label: '现在', minutesAgo: 0 },
  { label: '0.5h', minutesAgo: 30 },
  { label: '1h', minutesAgo: 60 },
  { label: '2h', minutesAgo: 120 },
];

const END_TIME_SHORTCUTS = [
  { label: '现在', minutesAgo: 0 },
  { label: '0.5h', minutesAgo: 30 },
  { label: '1h', minutesAgo: 60 },
];

const sortActivityTypes = (activityTypes: ActivityTypeOption[]) => [...activityTypes].sort((left, right) => {
  if (left.name === PLACEHOLDER_ACTIVITY_NAME && right.name !== PLACEHOLDER_ACTIVITY_NAME) return -1;
  if (right.name === PLACEHOLDER_ACTIVITY_NAME && left.name !== PLACEHOLDER_ACTIVITY_NAME) return 1;
  return 0;
});

export const TimeEntryModal = ({
  visible,
  form,
  title,
  submitText,
  activityTypes,
  onClose,
  onFinish,
}: TimeEntryModalProps) => {
  const [submitting, setSubmitting] = useState(false);
  const sortedActivityTypes = sortActivityTypes(activityTypes);

  useEffect(() => {
    if (!visible) setSubmitting(false);
  }, [visible]);

  const handleFinish = async (values: TimeEntryFormValues) => {
    if (submitting) return;

    try {
      setSubmitting(true);
      await onFinish(values);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      className={styles.entryModal}
      visible={visible}
      closeOnMaskClick
      showCloseButton
      onClose={onClose}
      content={
        <Form
          form={form}
          layout="horizontal"
          footer={
            <Button block type="submit" color="primary" size="large" loading={submitting} disabled={submitting}>
              {submitText}
            </Button>
          }
          className={styles.form}
          onFinish={handleFinish}
        >
          <div className={styles.modalTitle}>{title}</div>
          <Form.Item name="activityTypeId" hidden>
            <input type="hidden" />
          </Form.Item>
          {sortedActivityTypes.length > 0 && (
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.activityTypeId !== next.activityTypeId}>
              {({ getFieldValue }) => {
                const selectedIds = getFieldValue('activityTypeId') ?? [];
                const placeholderActivityType = sortedActivityTypes.find((activityType) => activityType.name === PLACEHOLDER_ACTIVITY_NAME);
                const placeholderActivityTypeId = placeholderActivityType ? String(placeholderActivityType.id) : undefined;
                const toggleActivityType = (activityTypeId: string) => {
                  const isSelected = selectedIds.includes(activityTypeId);
                  const onlyPlaceholderSelected = placeholderActivityTypeId != null
                    && selectedIds.length === 1
                    && selectedIds[0] === placeholderActivityTypeId;
                  let nextSelectedIds: string[];

                  if (activityTypeId === placeholderActivityTypeId) {
                    nextSelectedIds = isSelected
                      ? selectedIds.filter((selectedId: string) => selectedId !== activityTypeId)
                      : [activityTypeId];
                  } else if (onlyPlaceholderSelected) {
                    nextSelectedIds = [activityTypeId];
                  } else {
                    nextSelectedIds = isSelected
                      ? selectedIds.filter((selectedId: string) => selectedId !== activityTypeId)
                      : [...selectedIds.filter((selectedId: string) => selectedId !== placeholderActivityTypeId), activityTypeId];
                  }
                  form.setFieldsValue({ activityTypeId: nextSelectedIds.length > 0 ? nextSelectedIds : undefined });
                };

                return (
                  <div className={styles.activityField}>
                    <div className={styles.activityGrid}>
                      {sortedActivityTypes.map((activityType) => (
                        <button
                          key={activityType.id}
                          type="button"
                          className={selectedIds.includes(String(activityType.id)) ? styles.activityButtonActive : styles.activityButton}
                          aria-pressed={selectedIds.includes(String(activityType.id))}
                          onClick={() => toggleActivityType(String(activityType.id))}
                        >
                          <span className={styles.activitySwatch} style={{ background: activityType.color }} />
                          <span>{activityType.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }}
            </Form.Item>
          )}
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
          <div className={styles.startTimeShortcuts}>
            {START_TIME_SHORTCUTS.map((shortcut) => (
              <button
                key={shortcut.label}
                type="button"
                onClick={() => {
                  const startedAt = dayjs().second(0).millisecond(0).subtract(shortcut.minutesAgo, 'minute').toDate();
                  form.setFieldsValue({ startedAt });
                }}
              >
                {shortcut.label}
              </button>
            ))}
          </div>
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
          <div className={styles.startTimeShortcuts}>
            {END_TIME_SHORTCUTS.map((shortcut) => (
              <button
                key={shortcut.label}
                type="button"
                onClick={() => {
                  const endedAt = dayjs().second(0).millisecond(0).subtract(shortcut.minutesAgo, 'minute').toDate();
                  form.setFieldsValue({ endedAt });
                }}
              >
                {shortcut.label}
              </button>
            ))}
          </div>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.startedAt !== next.startedAt || prev.endedAt !== next.endedAt || prev.activityTypeId !== next.activityTypeId}>
            {({ getFieldValue }) => {
              const startedAt = getFieldValue('startedAt');
              const endedAt = getFieldValue('endedAt');
              const activityTypeIds = getFieldValue('activityTypeId') ?? [];
              const minutes = startedAt && endedAt ? minutesBetween(startedAt, endedAt) : 0;
              const activityCount = activityTypeIds.length;
              const perActivityHint = activityCount > 1 ? ` · 每项 ${formatDuration(minutes / activityCount)}` : '';
              return minutes > 0 ? <div className={styles.durationHint}>时长 {formatDuration(minutes)}{perActivityHint}</div> : null;
            }}
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      }
    />
  );
};