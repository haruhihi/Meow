import {
  ITimeActivitySummary,
  ITimeDailySummary,
  ITimeEntryAnalyzeReq,
  ITimeEntryAnalyzeRes,
  ITimeSegment,
  ISleepSample,
} from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getSession } from '@libs/session';
import { formatDateInTimezone, getDaysInMonth, getMonthRange, minutesBetween, splitTimeRangeByDay, splitTimeRangeEvenly } from '@utils/time';

const pad = (value: number) => String(value).padStart(2, '0');
const DAY_MS = 24 * 60 * 60 * 1000;

const nextDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day) + DAY_MS);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
};

const buildDailyMap = (range: { start: Date; end: Date }, timezoneOffset: number) => {
  const dailyMap = new Map<string, ITimeDailySummary>();
  let date = formatDateInTimezone(range.start, timezoneOffset);
  const endDate = formatDateInTimezone(new Date(range.end.getTime() - 1), timezoneOffset);

  while (date <= endDate) {
    dailyMap.set(date, { date, minutes: 0, byActivity: {} });
    date = nextDate(date);
  }

  return dailyMap;
};

export async function POST(req: Request) {
  try {
    const { activityTypeId, year, month, startedAt, endedAt, timezoneOffsetMinutes } = (await req.json()) as ITimeEntryAnalyzeReq;
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);
    const targetActivityTypeId = activityTypeId ? Number(activityTypeId) : null;

    const timezoneOffset = Number.isFinite(timezoneOffsetMinutes) ? Number(timezoneOffsetMinutes) : new Date().getTimezoneOffset();
    const hasCustomRange = Number.isFinite(startedAt) && Number.isFinite(endedAt);
    if (!hasCustomRange && !year) throw new Error('year is required');
    if (!hasCustomRange && (!month || month < 1 || month > 12)) throw new Error('Invalid month');

    const range = hasCustomRange
      ? { start: new Date(Number(startedAt)), end: new Date(Number(endedAt)) }
      : getMonthRange(Number(year), Number(month), timezoneOffset);
    if (Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime()) || range.end <= range.start) {
      throw new Error('Invalid time range');
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        userId: Number(userId),
        ...(targetActivityTypeId
          ? {
              OR: [
                { activityTypeId: targetActivityTypeId },
                { activities: { some: { activityTypeId: targetActivityTypeId } } },
              ],
            }
          : {}),
        endedAt: { gte: range.start, lt: range.end },
      },
      orderBy: { endedAt: 'desc' },
      include: {
        activityType: true,
        activities: {
          include: { activityType: true },
          orderBy: { id: 'asc' },
        },
      },
    });

    const dailyMap = hasCustomRange ? buildDailyMap(range, timezoneOffset) : new Map<string, ITimeDailySummary>();
    if (!hasCustomRange) {
      const daysInMonth = getDaysInMonth(Number(year), Number(month));
      for (let day = 1; day <= daysInMonth; day++) {
        const date = `${year}-${pad(Number(month))}-${pad(day)}`;
        dailyMap.set(date, { date, minutes: 0, byActivity: {} });
      }
    }

    const activityMap = new Map<number, ITimeActivitySummary>();
    const entryCountByActivity = new Map<number, number>();
    const rhythmSegments: ITimeSegment[] = [];
    const sleepSamples: ISleepSample[] = [];

    timeEntries.forEach((entry) => {
      const allActivities = entry.activities.length > 0
        ? entry.activities.map((item) => item.activityType)
        : [entry.activityType];
      const activityCount = allActivities.length;
      const visibleActivities = targetActivityTypeId
        ? allActivities.filter((activity) => activity.id === targetActivityTypeId)
        : allActivities;
      if (activityCount <= 0 || visibleActivities.length === 0) return;
      const entryStartDate = formatDateInTimezone(entry.startedAt, timezoneOffset);
      const entryEndDate = formatDateInTimezone(entry.endedAt, timezoneOffset);
      const shouldAssignToEndDate = entryStartDate !== entryEndDate;

      const splitSegments = splitTimeRangeByDay(
        { startedAt: entry.startedAt, endedAt: entry.endedAt },
        range,
        timezoneOffset
      );

      let clippedMinutes = 0;
      let visibleClippedMinutes = 0;
      const addDailyMinutes = (daily: ITimeDailySummary, minutes: number, startedAt: Date, endedAt: Date) => {
        const visibleMinutes = (minutes / activityCount) * visibleActivities.length;
        daily.minutes += visibleMinutes;
        visibleClippedMinutes += visibleMinutes;
        visibleActivities.forEach((activity) => {
          daily.byActivity[String(activity.id)] = (daily.byActivity[String(activity.id)] ?? 0) + minutes / activityCount;
        });

        const startedAtIso = startedAt.toISOString();
        const endedAtIso = endedAt.toISOString();
        if (!daily.firstStartedAt || startedAtIso < daily.firstStartedAt) daily.firstStartedAt = startedAtIso;
        if (!daily.lastEndedAt || endedAtIso > daily.lastEndedAt) daily.lastEndedAt = endedAtIso;
      };

      if (shouldAssignToEndDate) {
        const daily = dailyMap.get(entryEndDate);
        if (daily) {
          clippedMinutes = minutesBetween(entry.startedAt, entry.endedAt);
          addDailyMinutes(daily, clippedMinutes, entry.startedAt, entry.endedAt);
          dailyMap.set(entryEndDate, daily);
        }
      } else {
        splitSegments.forEach((segment) => {
          clippedMinutes += segment.minutes;
          const daily = dailyMap.get(segment.date) ?? { date: segment.date, minutes: 0, byActivity: {} };
          addDailyMinutes(daily, segment.minutes, segment.startedAt, segment.endedAt);
          dailyMap.set(segment.date, daily);
        });
      }

      splitSegments.forEach((segment) => {
        const evenSegments = splitTimeRangeEvenly(segment.startedAt, segment.endedAt, activityCount);
        allActivities.forEach((activity, index) => {
          if (!visibleActivities.some((visibleActivity) => visibleActivity.id === activity.id)) return;
          const evenSegment = evenSegments[index];
          if (!evenSegment) return;
          rhythmSegments.push({
            date: segment.date,
            activityTypeId: activity.id,
            name: activity.name,
            color: activity.color,
            startMinute: Math.max(segment.startMinute, segment.startMinute + Math.round(((segment.endMinute - segment.startMinute) * index) / activityCount)),
            endMinute: Math.max(segment.startMinute + 1, segment.startMinute + Math.round(((segment.endMinute - segment.startMinute) * (index + 1)) / activityCount)),
            minutes: minutesBetween(evenSegment.startedAt, evenSegment.endedAt),
          });
        });
      });

      if (clippedMinutes <= 0 || visibleClippedMinutes <= 0) return;
      visibleActivities.forEach((activity) => {
        entryCountByActivity.set(activity.id, (entryCountByActivity.get(activity.id) ?? 0) + 1);

        const current = activityMap.get(activity.id) ?? {
          activityTypeId: activity.id,
          name: activity.name,
          color: activity.color,
          icon: activity.icon,
          minutes: 0,
          count: 0,
        };
        current.minutes += clippedMinutes / activityCount;
        current.count = entryCountByActivity.get(activity.id) ?? 0;
        activityMap.set(activity.id, current);
      });

      const sleepActivity = visibleActivities.find((activity) => activity.name === '睡眠');
      if (sleepActivity && clippedMinutes > 0) {
        sleepSamples.push({
          date: shouldAssignToEndDate ? entryEndDate : entryStartDate,
          startedAt: entry.startedAt.toISOString(),
          endedAt: entry.endedAt.toISOString(),
          minutes: clippedMinutes / activityCount,
        });
      }
    });

    const activitySummaries = [...activityMap.values()]
      .map((item) => ({ ...item, minutes: Math.round(item.minutes) }))
      .sort((left, right) => right.minutes - left.minutes);
    const dailySummaries = [...dailyMap.values()].map((item) => ({
      ...item,
      minutes: Math.round(item.minutes),
    }));
    const totalMinutes = activitySummaries.reduce((sum, item) => sum + item.minutes, 0);
    const recordedDays = dailySummaries.filter((item) => item.minutes > 0).length;

    return success<ITimeEntryAnalyzeRes>({
      timeEntries,
      totalMinutes,
      recordedDays,
      activitySummaries,
      dailySummaries,
      rhythmSegments,
      sleepSamples,
    });
  } catch (error) {
    return fail(error);
  }
}
