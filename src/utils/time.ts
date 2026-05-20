import dayjs from 'dayjs';

export interface TimeRangeInput {
  startedAt: Date | string | number;
  endedAt: Date | string | number;
}

export interface SplitTimeSegment {
  date: string;
  startMinute: number;
  endMinute: number;
  minutes: number;
  startedAt: Date;
  endedAt: Date;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const minutesBetween = (startedAt: Date | string | number, endedAt: Date | string | number) => {
  const diff = dayjs(endedAt).diff(dayjs(startedAt), 'minute', true);
  return Math.max(0, Math.round(diff));
};

export const formatDuration = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  if (hours <= 0) return `${rest}分钟`;
  if (rest === 0) return `${hours}小时`;
  return `${hours}小时${rest}分钟`;
};

export const formatHours = (minutes: number) => {
  const hours = minutes / 60;
  return `${Number(hours.toFixed(hours >= 10 ? 1 : 2))}h`;
};

export const getMonthRange = (year: number, month: number, timezoneOffsetMinutes?: number) => {
  if (timezoneOffsetMinutes != null) {
    return {
      start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) + timezoneOffsetMinutes * MINUTE_MS),
      end: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) + timezoneOffsetMinutes * MINUTE_MS),
    };
  }

  const start = dayjs(new Date(year, month - 1, 1, 0, 0, 0, 0));
  return {
    start: start.toDate(),
    end: start.endOf('month').toDate(),
  };
};

export const getDaysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const pad = (value: number) => String(value).padStart(2, '0');

export const formatDateInTimezone = (date: Date | string | number, timezoneOffsetMinutes: number) => {
  const shifted = new Date(new Date(date).getTime() - timezoneOffsetMinutes * MINUTE_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
};

const getMinuteOfDayInTimezone = (timeMs: number, timezoneOffsetMinutes: number) => {
  const shifted = new Date(timeMs - timezoneOffsetMinutes * MINUTE_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
};

const getDayStartInTimezone = (timeMs: number, timezoneOffsetMinutes: number) => {
  const shifted = new Date(timeMs - timezoneOffsetMinutes * MINUTE_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) + timezoneOffsetMinutes * MINUTE_MS;
};

export const overlapsRange = (
  startedAt: Date | string | number,
  endedAt: Date | string | number,
  rangeStart: Date,
  rangeEnd: Date
) => dayjs(startedAt).isBefore(rangeEnd) && dayjs(endedAt).isAfter(rangeStart);

export const splitTimeRangeByDay = (
  range: TimeRangeInput,
  bounds?: { start: Date; end: Date },
  timezoneOffsetMinutes?: number
): SplitTimeSegment[] => {
  if (timezoneOffsetMinutes != null) {
    return splitTimeRangeByTimezoneDay(range, timezoneOffsetMinutes, bounds);
  }

  const rawStart = dayjs(range.startedAt);
  const rawEnd = dayjs(range.endedAt);
  if (!rawStart.isValid() || !rawEnd.isValid() || !rawEnd.isAfter(rawStart)) return [];

  const start = bounds && rawStart.isBefore(bounds.start) ? dayjs(bounds.start) : rawStart;
  const end = bounds && rawEnd.isAfter(bounds.end) ? dayjs(bounds.end) : rawEnd;
  if (!end.isAfter(start)) return [];

  const segments: SplitTimeSegment[] = [];
  let cursor = start;

  while (cursor.isBefore(end)) {
    const dayEnd = cursor.endOf('day').add(1, 'millisecond');
    const next = dayEnd.isBefore(end) ? dayEnd : end;
    const startMinute = cursor.hour() * 60 + cursor.minute();
    const endMinuteRaw = next.hour() * 60 + next.minute();
    const endMinute = next.isSame(cursor, 'day') ? endMinuteRaw : 24 * 60;
    const minutes = Math.max(1, Math.round(next.diff(cursor) / MINUTE_MS));

    segments.push({
      date: cursor.format('YYYY-MM-DD'),
      startMinute,
      endMinute: Math.max(endMinute, startMinute + 1),
      minutes,
      startedAt: cursor.toDate(),
      endedAt: next.toDate(),
    });

    cursor = next;
  }

  return segments;
};

const splitTimeRangeByTimezoneDay = (
  range: TimeRangeInput,
  timezoneOffsetMinutes: number,
  bounds?: { start: Date; end: Date }
): SplitTimeSegment[] => {
  const rawStartMs = new Date(range.startedAt).getTime();
  const rawEndMs = new Date(range.endedAt).getTime();
  if (Number.isNaN(rawStartMs) || Number.isNaN(rawEndMs) || rawEndMs <= rawStartMs) return [];

  const startMs = Math.max(rawStartMs, bounds?.start.getTime() ?? rawStartMs);
  const endMs = Math.min(rawEndMs, bounds?.end.getTime() ?? rawEndMs);
  if (endMs <= startMs) return [];

  const segments: SplitTimeSegment[] = [];
  let cursorMs = startMs;

  while (cursorMs < endMs) {
    const nextDayStartMs = getDayStartInTimezone(cursorMs, timezoneOffsetMinutes) + DAY_MS;
    const nextMs = Math.min(endMs, nextDayStartMs);
    const startMinute = getMinuteOfDayInTimezone(cursorMs, timezoneOffsetMinutes);
    const endMinute = nextMs === nextDayStartMs
      ? 24 * 60
      : getMinuteOfDayInTimezone(nextMs, timezoneOffsetMinutes);
    const minutes = Math.max(1, Math.round((nextMs - cursorMs) / MINUTE_MS));

    segments.push({
      date: formatDateInTimezone(cursorMs, timezoneOffsetMinutes),
      startMinute,
      endMinute: Math.max(endMinute, startMinute + 1),
      minutes,
      startedAt: new Date(cursorMs),
      endedAt: new Date(nextMs),
    });

    cursorMs = nextMs;
  }

  return segments;
};
