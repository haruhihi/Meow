export const DEFAULT_PREGNANCY_START_DATE = '2026-05-17';
export const PREGNANCY_TOTAL_DAYS = 40 * 7;
export const PREGNANCY_CYCLE_DAYS = 4 * 7;
export const PREGNANCY_CYCLE_COUNT = PREGNANCY_TOTAL_DAYS / PREGNANCY_CYCLE_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

const pad = (value: number) => String(value).padStart(2, '0');

const parseDateKey = (value: string) => {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const time = Date.UTC(year, month - 1, day);
  const parsed = new Date(time);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, time };
};

export const isValidPregnancyDate = (value: unknown): value is string => (
  typeof value === 'string' && parseDateKey(value) !== null
);

export const normalizePregnancyDate = (value: unknown, label = '日期') => {
  if (!isValidPregnancyDate(value)) throw new Error(`${label}无效`);
  return value;
};

export const pregnancyDateFromLocalDate = (date: Date) => (
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
);

export const pregnancyDateToLocalDate = (dateKey: string) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) throw new Error('日期无效');
  return new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0, 0);
};

export const addPregnancyDays = (dateKey: string, days: number) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed || !Number.isInteger(days)) throw new Error('日期计算参数无效');
  const result = new Date(parsed.time + days * DAY_MS);
  return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
};

export const pregnancyDaysBetween = (startDate: string, endDate: string) => {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (!start || !end) throw new Error('日期无效');
  return Math.round((end.time - start.time) / DAY_MS);
};

export const getPregnancyEndDate = (startDate: string) => addPregnancyDays(startDate, PREGNANCY_TOTAL_DAYS - 1);

export const clampPregnancyDate = (startDate: string, dateKey: string) => {
  const endDate = getPregnancyEndDate(startDate);
  if (dateKey < startDate) return startDate;
  if (dateKey > endDate) return endDate;
  return dateKey;
};

export const getPregnancyCycleIndex = (startDate: string, dateKey: string) => {
  const clamped = clampPregnancyDate(startDate, dateKey);
  return Math.min(
    PREGNANCY_CYCLE_COUNT - 1,
    Math.max(0, Math.floor(pregnancyDaysBetween(startDate, clamped) / PREGNANCY_CYCLE_DAYS))
  );
};

export const getPregnancyCycleLabel = (cycleIndex: number) => {
  const safeIndex = Math.min(PREGNANCY_CYCLE_COUNT - 1, Math.max(0, Math.round(cycleIndex)));
  const firstWeek = safeIndex * 4 + 1;
  return `孕${firstWeek}–${firstWeek + 3}周`;
};

export const getPregnancyCycleDates = (startDate: string, cycleIndex: number) => {
  const safeIndex = Math.min(PREGNANCY_CYCLE_COUNT - 1, Math.max(0, Math.round(cycleIndex)));
  const firstDayOffset = safeIndex * PREGNANCY_CYCLE_DAYS;
  return Array.from(
    { length: PREGNANCY_CYCLE_DAYS },
    (_, index) => addPregnancyDays(startDate, firstDayOffset + index)
  );
};

export const getPregnancyWeekRows = (startDate: string, cycleIndex: number) => {
  const dates = getPregnancyCycleDates(startDate, cycleIndex);
  return Array.from({ length: 4 }, (_, index) => ({
    displayWeek: cycleIndex * 4 + index + 1,
    dates: dates.slice(index * 7, index * 7 + 7),
  }));
};

export const getPregnancyAge = (startDate: string, dateKey: string) => {
  const gestationalDay = pregnancyDaysBetween(startDate, dateKey);
  const completedWeeks = Math.floor(gestationalDay / 7);
  const dayOfWeek = ((gestationalDay % 7) + 7) % 7;
  return {
    gestationalDay,
    completedWeeks,
    dayOfWeek,
    displayWeek: completedWeeks + 1,
    label: `孕${completedWeeks}周${dayOfWeek}天`,
  };
};

export const formatPregnancyMonthDay = (dateKey: string) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  return `${parsed.month}/${parsed.day}`;
};

export const getPregnancyWeekdayLabel = (dateKey: string) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return '';
  return `周${WEEKDAY_LABELS[new Date(parsed.time).getUTCDay()]}`;
};

export const getPregnancyWeekdayHeaders = (firstDate: string) => (
  Array.from({ length: 7 }, (_, index) => getPregnancyWeekdayLabel(addPregnancyDays(firstDate, index)).slice(1))
);
