'use client';

import {
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Selector,
} from 'antd-mobile';
import type { DatePickerRef, FormInstance, SelectorOption } from 'antd-mobile';
import dayjs from 'dayjs';
import type { RefObject } from 'react';
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

type TimeEntryModalProps = {
  visible: boolean;
  form: FormInstance;
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

export const TimeEntryModal = ({
  visible,
  form,
  title,
  submitText,
  activityTypes,
  onClose,
  onFinish,
}: TimeEntryModalProps) => {
  const activityOptions: SelectorOption<string>[] = activityTypes.map((activityType) => ({
    value: String(activityType.id),
    label: (
      <span className={styles.activityOption}>
        <span className={styles.activitySwatch} style={{ background: activityType.color }} />
        <span>{activityType.name}</span>
      </span>
    ),
  }));

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
            <Button block type="submit" color="primary" size="large">
              {submitText}
            </Button>
          }
          className={styles.form}
          onFinish={onFinish}
        >
          <div className={styles.modalTitle}>{title}</div>
          {activityOptions.length > 0 && (
            <Form.Item name="activityTypeId" className={styles.activityField}>
              <Selector className={styles.activitySelector} columns={3} options={activityOptions} />
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
  );
};