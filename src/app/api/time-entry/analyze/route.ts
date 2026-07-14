import {
  ITimeActivityGroupSummary,
  ITimeEntryAnalyzeReq,
  ITimeEntryAnalyzeRes,
  ITimeGroupDailySummary,
  ITimeGroupHourlySummary,
} from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getSession } from '@libs/session';
import { formatDateInTimezone, minutesBetween } from '@utils/time';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const pad = (value: number) => String(value).padStart(2, '0');

const nextDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day) + DAY_MS);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
};

const buildDailyMap = (range: { start: Date; end: Date }, timezoneOffset: number) => {
  const dailyMap = new Map<string, ITimeGroupDailySummary>();
  let date = formatDateInTimezone(range.start, timezoneOffset);
  const endDate = formatDateInTimezone(new Date(range.end.getTime() - 1), timezoneOffset);

  while (date <= endDate) {
    dailyMap.set(date, { date, hasRecords: false, byGroup: {} });
    date = nextDate(date);
  }

  return dailyMap;
};

const getHourInTimezone = (date: Date, timezoneOffset: number) => {
  const shifted = new Date(date.getTime() - timezoneOffset * MINUTE_MS);
  return shifted.getUTCHours();
};

const isTargetMet = (minutes: number, targetMinutes: number, targetDirection: 'AT_LEAST' | 'AT_MOST') => (
  targetDirection === 'AT_MOST' ? minutes <= targetMinutes : minutes >= targetMinutes
);

export async function POST(req: Request) {
  try {
    const { startedAt, endedAt, timezoneOffsetMinutes, includeHourly } = (await req.json()) as ITimeEntryAnalyzeReq;
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) throw new Error('开始和结束时间无效');

    const range = { start: new Date(startedAt), end: new Date(endedAt) };
    if (Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime()) || range.end <= range.start) {
      throw new Error('时间范围无效');
    }
    if (range.end.getTime() - range.start.getTime() > 31 * DAY_MS) {
      throw new Error('时间范围不能超过 31 天');
    }

    const userIdNumber = Number(userId);
    const timezoneOffset = Number.isFinite(timezoneOffsetMinutes) ? Number(timezoneOffsetMinutes) : new Date().getTimezoneOffset();
    const [groups, timeEntries] = await Promise.all([
      prisma.timeActivityGroup.findMany({
        where: { userId: userIdNumber },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      prisma.timeEntry.findMany({
        where: {
          userId: userIdNumber,
          endedAt: { gte: range.start, lt: range.end },
        },
        orderBy: { endedAt: 'asc' },
        include: {
          activityType: {
            include: { group: true },
          },
          activities: {
            include: {
              activityType: {
                include: { group: true },
              },
            },
            orderBy: { id: 'asc' },
          },
        },
      }),
    ]);

    const dailyMap = buildDailyMap(range, timezoneOffset);
    const hourlySummaries: ITimeGroupHourlySummary[] = includeHourly
      ? Array.from({ length: 24 }, (_, hour) => ({ hour, byGroup: {} }))
      : [];
    const groupMinutes = new Map(groups.map((group) => [group.id, 0]));

    timeEntries.forEach((entry) => {
      const date = formatDateInTimezone(entry.endedAt, timezoneOffset);
      const daily = dailyMap.get(date);
      if (!daily) return;

      daily.hasRecords = true;
      const allActivities = entry.activities.length > 0
        ? entry.activities.map((item) => item.activityType)
        : [entry.activityType];
      if (allActivities.length === 0) return;

      const minutes = minutesBetween(entry.startedAt, entry.endedAt);
      if (minutes <= 0) return;
      const minutesPerActivity = minutes / allActivities.length;
      const hour = includeHourly ? getHourInTimezone(entry.endedAt, timezoneOffset) : -1;

      allActivities.forEach((activity) => {
        const group = activity.group;
        if (!group || !groupMinutes.has(group.id)) return;
        const groupKey = String(group.id);
        daily.byGroup[groupKey] = (daily.byGroup[groupKey] ?? 0) + minutesPerActivity;
        groupMinutes.set(group.id, (groupMinutes.get(group.id) ?? 0) + minutesPerActivity);
        if (hour >= 0) {
          const hourly = hourlySummaries[hour];
          hourly.byGroup[groupKey] = (hourly.byGroup[groupKey] ?? 0) + minutesPerActivity;
        }
      });
    });

    const dailySummaries = [...dailyMap.values()].map((daily) => ({
      ...daily,
      byGroup: Object.fromEntries(
        Object.entries(daily.byGroup).map(([groupId, minutes]) => [groupId, Math.round(minutes)])
      ),
    }));
    const recordedDays = dailySummaries.filter((daily) => daily.hasRecords).length;
    const groupSummaries: ITimeActivityGroupSummary[] = groups.map((group) => {
      const targetMetDays = [...dailyMap.values()].filter((daily) => (
        daily.hasRecords
        && isTargetMet(Math.round(daily.byGroup[String(group.id)] ?? 0), group.targetMinutes, group.targetDirection)
      )).length;
      return {
        groupId: group.id,
        name: group.name,
        color: group.color,
        targetMinutes: group.targetMinutes,
        targetDirection: group.targetDirection,
        minutes: Math.round(groupMinutes.get(group.id) ?? 0),
        recordedDays,
        targetMetDays,
      };
    });

    return success<ITimeEntryAnalyzeRes>({
      groupSummaries,
      recordedDays,
      dailySummaries,
      hourlySummaries: hourlySummaries.map((hourly) => ({
        ...hourly,
        byGroup: Object.fromEntries(
          Object.entries(hourly.byGroup).map(([groupId, minutes]) => [groupId, Math.round(minutes)])
        ),
      })),
    });
  } catch (error) {
    return fail(error);
  }
}