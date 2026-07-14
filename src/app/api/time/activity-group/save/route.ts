import {
  ITimeActivityGroupDraft,
  ITimeActivityGroupSaveReq,
  ITimeActivityGroupSaveRes,
} from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getSession } from '@libs/session';
import { TIME_ACTIVITY_GROUP_COLORS } from '@styles/theme';
import { PLACEHOLDER_ACTIVITY_NAME } from '@utils/time-activity';

const MAX_GROUP_COUNT = 20;
const MAX_GROUP_NAME_LENGTH = 20;
const MIN_TARGET_MINUTES = 1;
const MAX_TARGET_MINUTES = 24 * 60;

type NormalizedGroupDraft = {
  id?: number;
  name: string;
  targetMinutes: number;
  targetDirection: ITimeActivityGroupDraft['targetDirection'];
  activityTypeIds: number[];
};

const toOptionalPositiveInteger = (value: unknown, label: string) => {
  if (value == null) return undefined;
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) throw new Error(`${label}无效`);
  return result;
};

const normalizeGroupDrafts = (value: unknown): NormalizedGroupDraft[] => {
  if (!Array.isArray(value)) throw new Error('分组配置无效');
  if (value.length > MAX_GROUP_COUNT) throw new Error(`最多可保存 ${MAX_GROUP_COUNT} 个分组`);

  const groupIds = new Set<number>();
  const groupNames = new Set<string>();
  const activityTypeIds = new Set<number>();

  return value.map((rawGroup, index) => {
    if (!rawGroup || typeof rawGroup !== 'object') throw new Error(`第 ${index + 1} 个分组无效`);
    const group = rawGroup as Partial<ITimeActivityGroupDraft>;
    const id = toOptionalPositiveInteger(group.id, `第 ${index + 1} 个分组 ID`);
    if (id != null) {
      if (groupIds.has(id)) throw new Error('同一个分组不能重复提交');
      groupIds.add(id);
    }

    const name = typeof group.name === 'string' ? group.name.trim() : '';
    if (!name) throw new Error(`请填写第 ${index + 1} 个分组名称`);
    if (name.length > MAX_GROUP_NAME_LENGTH) throw new Error(`分组名称不能超过 ${MAX_GROUP_NAME_LENGTH} 个字符`);
    if (groupNames.has(name)) throw new Error('分组名称不能重复');
    groupNames.add(name);

    const targetMinutes = Number(group.targetMinutes);
    if (!Number.isInteger(targetMinutes) || targetMinutes < MIN_TARGET_MINUTES || targetMinutes > MAX_TARGET_MINUTES) {
      throw new Error(`每日目标需为 ${MIN_TARGET_MINUTES}-${MAX_TARGET_MINUTES} 分钟的整数`);
    }

    if (group.targetDirection !== 'AT_LEAST' && group.targetDirection !== 'AT_MOST') {
      throw new Error('目标方向无效');
    }

    if (group.activityTypeIds != null && !Array.isArray(group.activityTypeIds)) {
      throw new Error(`第 ${index + 1} 个分组的活动无效`);
    }
    const normalizedActivityTypeIds = (group.activityTypeIds ?? []).map((activityTypeId) => {
      const idValue = Number(activityTypeId);
      if (!Number.isInteger(idValue) || idValue <= 0) throw new Error('活动 ID 无效');
      return idValue;
    });
    if (new Set(normalizedActivityTypeIds).size !== normalizedActivityTypeIds.length) {
      throw new Error('同一分组不能重复选择活动');
    }
    normalizedActivityTypeIds.forEach((activityTypeId) => {
      if (activityTypeIds.has(activityTypeId)) throw new Error('一个活动只能归属一个分组');
      activityTypeIds.add(activityTypeId);
    });

    return { id, name, targetMinutes, targetDirection: group.targetDirection, activityTypeIds: normalizedActivityTypeIds };
  });
};

const pickGroupColor = (usedColors: Set<string>) => {
  const color = TIME_ACTIVITY_GROUP_COLORS.find((candidate) => !usedColors.has(candidate.toUpperCase()))
    ?? TIME_ACTIVITY_GROUP_COLORS[usedColors.size % TIME_ACTIVITY_GROUP_COLORS.length];
  usedColors.add(color.toUpperCase());
  return color;
};

const findGroups = (userId: number) => prisma.timeActivityGroup.findMany({
  where: { userId },
  include: {
    activityTypes: {
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    },
  },
  orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
});

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ITimeActivityGroupSaveReq;
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);
    const userIdNumber = Number(userId);
    const groups = normalizeGroupDrafts(body?.groups);

    const existingGroups = await prisma.timeActivityGroup.findMany({ where: { userId: userIdNumber } });
    const existingGroupIds = new Set(existingGroups.map((group) => group.id));
    groups.forEach((group) => {
      if (group.id != null && !existingGroupIds.has(group.id)) throw new Error('分组不存在或无权修改');
    });

    const selectedActivityTypeIds = groups.flatMap((group) => group.activityTypeIds);
    if (selectedActivityTypeIds.length > 0) {
      const activityTypes = await prisma.activityType.findMany({
        where: { userId: userIdNumber, id: { in: selectedActivityTypeIds } },
        select: { id: true, name: true },
      });
      if (activityTypes.length !== selectedActivityTypeIds.length) throw new Error('活动不存在或无权修改');
      if (activityTypes.some((activityType) => activityType.name === PLACEHOLDER_ACTIVITY_NAME)) {
        throw new Error('占位活动不能加入分组');
      }
    }

    const submittedGroupIds = new Set(groups.flatMap((group) => group.id == null ? [] : [group.id]));
    const staleGroupIds = existingGroups
      .filter((group) => !submittedGroupIds.has(group.id))
      .map((group) => group.id);
    const usedColors = new Set(
      existingGroups
        .filter((group) => submittedGroupIds.has(group.id))
        .map((group) => group.color.toUpperCase())
    );
    const temporaryNameSeed = Date.now();

    await prisma.$transaction(async (tx) => {
      if (staleGroupIds.length > 0) {
        await tx.timeActivityGroup.deleteMany({
          where: { userId: userIdNumber, id: { in: staleGroupIds } },
        });
      }

      for (const [index, group] of groups.entries()) {
        if (group.id == null) continue;
        await tx.timeActivityGroup.update({
          where: { id: group.id },
          data: { name: `__time_group_${group.id}_${temporaryNameSeed}_${index}` },
        });
      }

      const persistedGroups: Array<{ id: number; activityTypeIds: number[] }> = [];
      for (const [index, group] of groups.entries()) {
        const data = {
          name: group.name,
          targetMinutes: group.targetMinutes,
          targetDirection: group.targetDirection,
          sortOrder: index,
        };
        if (group.id != null) {
          const updated = await tx.timeActivityGroup.update({
            where: { id: group.id },
            data,
            select: { id: true },
          });
          persistedGroups.push({ id: updated.id, activityTypeIds: group.activityTypeIds });
        } else {
          const created = await tx.timeActivityGroup.create({
            data: {
              userId: userIdNumber,
              color: pickGroupColor(usedColors),
              ...data,
            },
            select: { id: true },
          });
          persistedGroups.push({ id: created.id, activityTypeIds: group.activityTypeIds });
        }
      }

      await tx.activityType.updateMany({
        where: { userId: userIdNumber },
        data: { groupId: null },
      });
      for (const group of persistedGroups) {
        if (group.activityTypeIds.length === 0) continue;
        await tx.activityType.updateMany({
          where: { userId: userIdNumber, id: { in: group.activityTypeIds } },
          data: { groupId: group.id },
        });
      }
    });

    return success<ITimeActivityGroupSaveRes>({ groups: await findGroups(userIdNumber) });
  } catch (error) {
    return fail(error);
  }
}
