import type { PregnancyCaution, PregnancyDailyRecord, PregnancyProfile } from '@prisma/client';
import type { PregnancyCautionItem, PregnancyDailyRecordItem, PregnancyProfileItem } from '@dtos/meow';
import { prisma } from '@libs/prisma';
import {
  DEFAULT_PREGNANCY_START_DATE,
  getPregnancyEndDate,
  normalizePregnancyDate,
} from '@utils/pregnancy';

const MAX_CONTENT_LENGTH = 20_000;
const MIN_TIMEZONE_OFFSET = -14 * 60;
const MAX_TIMEZONE_OFFSET = 14 * 60;

export const normalizePregnancyContent = (value: unknown, label: string) => {
  if (typeof value !== 'string') throw new Error(`请填写${label}`);
  const content = value.trim();
  if (!content) throw new Error(`请填写${label}`);
  if (content.length > MAX_CONTENT_LENGTH) throw new Error(`${label}不能超过 ${MAX_CONTENT_LENGTH} 个字符`);
  return content;
};

export const normalizePregnancyRange = (startValue: unknown, endValue: unknown) => {
  const startDate = normalizePregnancyDate(startValue, '开始日期');
  const endDate = normalizePregnancyDate(endValue, '结束日期');
  if (startDate > endDate) throw new Error('结束日期不能早于开始日期');
  return { startDate, endDate };
};

export const getTodayForTimezone = (timezoneOffsetMinutes: unknown) => {
  const offset = Number(timezoneOffsetMinutes);
  const safeOffset = Number.isFinite(offset) && offset >= MIN_TIMEZONE_OFFSET && offset <= MAX_TIMEZONE_OFFSET
    ? offset
    : new Date().getTimezoneOffset();
  return new Date(Date.now() - safeOffset * 60 * 1000).toISOString().slice(0, 10);
};

export const ensurePregnancyProfile = async (fallbackUserId: number) => {
  const existing = await prisma.pregnancyProfile.findFirst({
    orderBy: [{ id: 'asc' }],
  });
  if (existing) return existing;

  return prisma.pregnancyProfile.create({
    data: { userId: fallbackUserId, startDate: DEFAULT_PREGNANCY_START_DATE },
  });
};

export const getPregnancyBounds = (startDate: string) => ({
  startDate,
  endDate: getPregnancyEndDate(startDate),
});

export const pregnancyProfileToItem = (profile: PregnancyProfile): PregnancyProfileItem => ({
  ...profile,
  createdAt: profile.createdAt.toISOString(),
  updatedAt: profile.updatedAt.toISOString(),
});

export const pregnancyCautionToItem = (caution: PregnancyCaution): PregnancyCautionItem => ({
  ...caution,
  createdAt: caution.createdAt.toISOString(),
  updatedAt: caution.updatedAt.toISOString(),
});

export const pregnancyRecordToItem = (record: PregnancyDailyRecord): PregnancyDailyRecordItem => ({
  ...record,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});
