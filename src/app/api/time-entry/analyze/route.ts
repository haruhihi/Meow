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
import { formatDateInTimezone, getDaysInMonth, getMonthRange, splitTimeRangeByDay } from '@utils/time';

const pad = (value: number) => String(value).padStart(2, '0');

export async function POST(req: Request) {
  try {
    const { activityTypeId, year, month, timezoneOffsetMinutes } = (await req.json()) as ITimeEntryAnalyzeReq;
    const userId = (await getSession())?.userId;
    if (!userId) throw new Error(`User not found:${userId}`);
    if (!year) throw new Error('year is required');
    if (!month || month < 1 || month > 12) throw new Error('Invalid month');

    const timezoneOffset = Number.isFinite(timezoneOffsetMinutes) ? Number(timezoneOffsetMinutes) : new Date().getTimezoneOffset();
    const range = getMonthRange(year, month, timezoneOffset);
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        userId: Number(userId),
        ...(activityTypeId ? { activityTypeId: Number(activityTypeId) } : {}),
        startedAt: { lt: range.end },
        endedAt: { gt: range.start },
      },
      orderBy: { startedAt: 'desc' },
      include: { activityType: true },
    });

    const daysInMonth = getDaysInMonth(year, month);
    const dailyMap = new Map<string, ITimeDailySummary>();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${pad(month)}-${pad(day)}`;
      dailyMap.set(date, { date, minutes: 0, byActivity: {} });
    }

    const activityMap = new Map<number, ITimeActivitySummary>();
    const entryCountByActivity = new Map<number, number>();
    const rhythmSegments: ITimeSegment[] = [];
    const sleepSamples: ISleepSample[] = [];

    timeEntries.forEach((entry) => {
      const activity = entry.activityType;
      entryCountByActivity.set(activity.id, (entryCountByActivity.get(activity.id) ?? 0) + 1);

      const splitSegments = splitTimeRangeByDay(
        { startedAt: entry.startedAt, endedAt: entry.endedAt },
        range,
        timezoneOffset
      );

      let clippedMinutes = 0;
      splitSegments.forEach((segment) => {
        clippedMinutes += segment.minutes;
        const daily = dailyMap.get(segment.date) ?? { date: segment.date, minutes: 0, byActivity: {} };
        daily.minutes += segment.minutes;
        daily.byActivity[String(activity.id)] = (daily.byActivity[String(activity.id)] ?? 0) + segment.minutes;

        const startedAtIso = segment.startedAt.toISOString();
        const endedAtIso = segment.endedAt.toISOString();
        if (!daily.firstStartedAt || startedAtIso < daily.firstStartedAt) daily.firstStartedAt = startedAtIso;
        if (!daily.lastEndedAt || endedAtIso > daily.lastEndedAt) daily.lastEndedAt = endedAtIso;
        dailyMap.set(segment.date, daily);

        rhythmSegments.push({
          date: segment.date,
          activityTypeId: activity.id,
          name: activity.name,
          color: activity.color,
          startMinute: segment.startMinute,
          endMinute: segment.endMinute,
          minutes: segment.minutes,
        });
      });

      const current = activityMap.get(activity.id) ?? {
        activityTypeId: activity.id,
        name: activity.name,
        color: activity.color,
        icon: activity.icon,
        minutes: 0,
        count: 0,
      };
      current.minutes += clippedMinutes;
      current.count = entryCountByActivity.get(activity.id) ?? 0;
      activityMap.set(activity.id, current);

      if (activity.name === '睡眠' && clippedMinutes > 0) {
        sleepSamples.push({
          date: formatDateInTimezone(entry.startedAt, timezoneOffset),
          startedAt: entry.startedAt.toISOString(),
          endedAt: entry.endedAt.toISOString(),
          minutes: clippedMinutes,
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
