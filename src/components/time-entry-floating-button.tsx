'use client';

import { FloatingBubble, Toast } from 'antd-mobile';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { post } from '@libs/fetch';
import {
  IActivityTypeCreateReq,
  IActivityTypeCreateRes,
  ITimeEntryCreateReq,
  ITimeEntryCreateRes,
} from '@dtos/meow';

type ActivityTypeOption = {
  id: number;
  name: string;
};

type TimeEntryFloatingButtonProps = {
  initialPositionBottom: string;
  background: string;
  activityTypes: ActivityTypeOption[];
  children: ReactNode;
  onClick: () => void;
  onQuickCreateSuccess?: () => void | Promise<void>;
};

const DOUBLE_CLICK_DELAY_MS = 240;
const PLACEHOLDER_ACTIVITY_NAME = '占位';

export const TimeEntryFloatingButton = ({
  initialPositionBottom,
  background,
  activityTypes,
  children,
  onClick,
  onQuickCreateSuccess,
}: TimeEntryFloatingButtonProps) => {
  const router = useRouter();
  const clickTimerRef = useRef<number | null>(null);
  const [creating, setCreating] = useState(false);

  const clearClickTimer = () => {
    if (clickTimerRef.current == null) return;
    window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  };

  useEffect(() => clearClickTimer, []);

  const quickCreatePlaceholder = async () => {
    if (creating) return;

    try {
      setCreating(true);
      const placeholderActivity = activityTypes.find((activityType) => activityType.name === PLACEHOLDER_ACTIVITY_NAME);
      let activityTypeId = placeholderActivity?.id;
      if (!activityTypeId) {
        const res = await post<IActivityTypeCreateReq, IActivityTypeCreateRes>('/api/time/activity-type/create', {
          name: PLACEHOLDER_ACTIVITY_NAME,
        });
        activityTypeId = res.activityType.id;
      }

      const startedAt = dayjs().second(0).millisecond(0);
      await post<ITimeEntryCreateReq, ITimeEntryCreateRes>('/api/time-entry/create', {
        activityTypeId,
        startedAt: startedAt.valueOf(),
        endedAt: startedAt.add(1, 'minute').valueOf(),
      });

      Toast.show({
        content: '占位时间记录成功',
        afterClose: () => router.push('/meow/time'),
      });
      void Promise.resolve(onQuickCreateSuccess?.()).catch(() => undefined);
    } catch {
      Toast.show({ content: '占位时间记录失败' });
    } finally {
      setCreating(false);
    }
  };

  const handleClick = () => {
    if (creating) return;

    if (clickTimerRef.current != null) {
      clearClickTimer();
      void quickCreatePlaceholder();
      return;
    }

    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      onClick();
    }, DOUBLE_CLICK_DELAY_MS);
  };

  return (
    <FloatingBubble
      style={{
        '--initial-position-bottom': initialPositionBottom,
        '--initial-position-right': '24px',
        '--edge-distance': '44px',
        '--background': background,
        opacity: creating ? 0.55 : 1,
        pointerEvents: creating ? 'none' : 'auto',
      }}
      onClick={handleClick}
    >
      {children}
    </FloatingBubble>
  );
};