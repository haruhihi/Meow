'use client';

import { Button, Dialog, Input, Modal, Selector, Toast } from 'antd-mobile';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { post } from '@libs/fetch';
import {
  ITimeActivityGroupDraft,
  ITimeActivityGroupSaveReq,
  ITimeActivityGroupSaveRes,
  TimeActivityGroupWithActivityTypes,
} from '@dtos/meow';
import { PLACEHOLDER_ACTIVITY_NAME } from '@utils/time-activity';
import styles from './time-group-settings-modal.module.scss';

type ActivityTypeOption = {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
};

type GroupDraft = ITimeActivityGroupDraft & {
  key: string;
};

type TimeGroupSettingsModalProps = {
  visible: boolean;
  groups: TimeActivityGroupWithActivityTypes[];
  activityTypes: ActivityTypeOption[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

const DIRECTION_OPTIONS = [
  { label: '至少达到', value: 'AT_LEAST' },
  { label: '不超过', value: 'AT_MOST' },
];

const makeDraftKey = () => `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const toDrafts = (groups: TimeActivityGroupWithActivityTypes[]): GroupDraft[] => groups.map((group) => ({
  key: String(group.id),
  id: group.id,
  name: group.name,
  targetMinutes: group.targetMinutes,
  targetDirection: group.targetDirection,
  activityTypeIds: group.activityTypes.map((activityType) => activityType.id),
}));

export const TimeGroupSettingsModal = ({
  visible,
  groups,
  activityTypes,
  onClose,
  onSaved,
}: TimeGroupSettingsModalProps) => {
  const [drafts, setDrafts] = useState<GroupDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const selectableActivities = useMemo(
    () => activityTypes
      .filter((activityType) => activityType.name !== PLACEHOLDER_ACTIVITY_NAME)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id),
    [activityTypes]
  );

  useEffect(() => {
    if (!visible) return;
    setDrafts(toDrafts(groups));
  }, [visible, groups]);

  const updateDraft = (key: string, updater: (draft: GroupDraft) => GroupDraft) => {
    setDrafts((current) => current.map((draft) => draft.key === key ? updater(draft) : draft));
  };

  const moveDraft = (index: number, offset: number) => {
    setDrafts((current) => {
      const targetIndex = index + offset;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const removeDraft = async (draft: GroupDraft) => {
    const confirmed = await Dialog.confirm({
      title: '删除分组',
      content: `删除“${draft.name || '未命名分组'}”后，成员活动会变为未分组。`,
    });
    if (!confirmed) return;
    setDrafts((current) => current.filter((item) => item.key !== draft.key));
  };

  const toggleActivity = (groupKey: string, activityTypeId: number) => {
    setDrafts((current) => {
      const currentGroup = current.find((group) => group.key === groupKey);
      const selected = currentGroup?.activityTypeIds.includes(activityTypeId) ?? false;
      return current.map((group) => {
        const withoutActivity = group.activityTypeIds.filter((id) => id !== activityTypeId);
        if (group.key !== groupKey) return { ...group, activityTypeIds: withoutActivity };
        return {
          ...group,
          activityTypeIds: selected ? withoutActivity : [...withoutActivity, activityTypeId],
        };
      });
    });
  };

  const save = async () => {
    if (saving) return;
    if (drafts.some((draft) => !draft.name.trim())) {
      Toast.show({ content: '请填写所有分组名称' });
      return;
    }
    if (drafts.some((draft) => !Number.isInteger(Number(draft.targetMinutes)) || Number(draft.targetMinutes) < 1 || Number(draft.targetMinutes) > 1440)) {
      Toast.show({ content: '每日目标需为 1-1440 分钟的整数' });
      return;
    }

    try {
      setSaving(true);
      await post<ITimeActivityGroupSaveReq, ITimeActivityGroupSaveRes>('/api/time/activity-group/save', {
        groups: drafts.map(({ id, name, targetMinutes, targetDirection, activityTypeIds }) => ({
          ...(id == null ? {} : { id }),
          name: name.trim(),
          targetMinutes: Number(targetMinutes),
          targetDirection,
          activityTypeIds,
        })),
      });
      await onSaved();
      Toast.show({ content: '分组配置已保存' });
      onClose();
    } catch (error) {
      Toast.show({ content: (error as { result?: string })?.result ?? '保存失败，请重试' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      className={styles.settingsModal}
      visible={visible}
      closeOnMaskClick={!saving}
      showCloseButton
      actions={[
        { key: 'cancel', text: '取消', disabled: saving, onClick: onClose },
        { key: 'save', text: saving ? '保存中...' : '保存配置', primary: true, disabled: saving, onClick: save },
      ]}
      onClose={() => {
        if (!saving) onClose();
      }}
      content={
        <div className={styles.panel}>
          <div className={styles.heading}>分组与每日目标</div>
          <div className={styles.hint}>每项活动只能归入一个分组；未分组活动仍会保留在最近记录中。</div>

          <div className={styles.groupList}>
            {drafts.map((draft, index) => (
              <section
                key={draft.key}
                className={styles.groupCard}
                style={{ '--group-color': groups.find((group) => group.id === draft.id)?.color ?? 'var(--meow-primary)' } as CSSProperties}
              >
                <div className={styles.groupCardHeader}>
                  <span className={styles.groupIndex}>#{index + 1}</span>
                  <Input
                    className={styles.groupNameInput}
                    value={draft.name}
                    placeholder="分组名称"
                    maxLength={20}
                    onChange={(name) => updateDraft(draft.key, (current) => ({ ...current, name }))}
                  />
                  <div className={styles.reorderActions}>
                    <button
                      type="button"
                      className={styles.smallAction}
                      disabled={index === 0}
                      onClick={() => moveDraft(index, -1)}
                    >
                      上移
                    </button>
                    <button
                      type="button"
                      className={styles.smallAction}
                      disabled={index === drafts.length - 1}
                      onClick={() => moveDraft(index, 1)}
                    >
                      下移
                    </button>
                    <button
                      type="button"
                      className={[styles.smallAction, styles.deleteAction].join(' ')}
                      onClick={() => void removeDraft(draft)}
                    >
                      删除
                    </button>
                  </div>
                </div>

                <label className={styles.fieldLabel}>每日目标</label>
                <div className={styles.targetRow}>
                  <Input
                    className={styles.targetInput}
                    value={String(draft.targetMinutes)}
                    type="number"
                    placeholder="分钟"
                    onChange={(value) => updateDraft(draft.key, (current) => ({ ...current, targetMinutes: Number(value) }))}
                  />
                  <Selector
                    className={styles.directionSelector}
                    columns={1}
                    options={DIRECTION_OPTIONS}
                    value={[draft.targetDirection]}
                    onChange={(value) => {
                      const targetDirection = value[0] as ITimeActivityGroupDraft['targetDirection'] | undefined;
                      if (targetDirection) updateDraft(draft.key, (current) => ({ ...current, targetDirection }));
                    }}
                  />
                </div>

                <label className={styles.fieldLabel}>活动成员</label>
                {selectableActivities.length > 0 ? (
                  <div className={styles.activityGrid}>
                    {selectableActivities.map((activityType) => {
                      const selected = draft.activityTypeIds.includes(activityType.id);
                      return (
                        <button
                          key={activityType.id}
                          type="button"
                          className={[styles.activityButton, selected ? styles.activityButtonActive : ''].join(' ')}
                          aria-pressed={selected}
                          onClick={() => toggleActivity(draft.key, activityType.id)}
                        >
                          <span className={styles.activityDot} style={{ background: activityType.color }} />
                          <span>{activityType.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyActivities}>还没有可归类的活动，请先新增时间记录。</div>
                )}
              </section>
            ))}

            <Button
              className={styles.addButton}
              size="small"
              fill="outline"
              color="primary"
              onClick={() => setDrafts((current) => [
                ...current,
                {
                  key: makeDraftKey(),
                  name: '',
                  targetMinutes: 60,
                  targetDirection: 'AT_LEAST',
                  activityTypeIds: [],
                },
              ])}
            >
              新增分组
            </Button>
          </div>
        </div>
      }
    />
  );
};
