import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { post } from '@libs/fetch';
import {
  IActivityTypeListRes,
  ITimeEntryAnalyzeReq,
  ITimeEntryAnalyzeRes,
  ITimeEntrySearchReq,
  ITimeEntrySearchRes,
} from '@dtos/meow';

const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 15;

export const useActivityTypes = (refreshKey = 0) => {
  const [activityTypes, setActivityTypes] = useState<IActivityTypeListRes['activityTypes']>();

  const fetchActivityTypes = async () => {
    const res = await post<null, IActivityTypeListRes>('/api/time/activity-type/list', null);
    setActivityTypes(res.activityTypes);
  };

  useEffect(() => {
    fetchActivityTypes();
  }, [refreshKey]);

  return {
    activityTypes,
    reQuery: fetchActivityTypes,
  };
};

export const useTimeEntries = () => {
  const [page, setPage] = useState<number>(DEFAULT_PAGE);
  const [timeEntries, setTimeEntries] = useState<ITimeEntrySearchRes['timeEntries']>();
  const [hasMore, setHasMore] = useState<boolean>(true);

  const fetchTimeEntries = async (nextPage: number) => {
    const res = await post<ITimeEntrySearchReq, ITimeEntrySearchRes>('/api/time-entry/search', {
      page: nextPage,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    setTimeEntries((current) => {
      if (!current || nextPage === DEFAULT_PAGE) return res.timeEntries;
      return [...current, ...res.timeEntries];
    });

    if (res.timeEntries.length < DEFAULT_PAGE_SIZE) {
      setHasMore(false);
    }

    if (res.timeEntries.length > 0) {
      setPage(nextPage);
    }
  };

  useEffect(() => {
    fetchTimeEntries(DEFAULT_PAGE);
  }, []);

  return {
    timeEntries,
    loadMore: async () => fetchTimeEntries(page + 1),
    hasMore,
    reQuery: async () => {
      setTimeEntries(undefined);
      setPage(DEFAULT_PAGE);
      setHasMore(true);
      await fetchTimeEntries(DEFAULT_PAGE);
    },
  };
};

export const useTimeMonthAnalyze = (month: dayjs.Dayjs, refreshKey = 0, activityTypeId?: number) => {
  const [data, setData] = useState<ITimeEntryAnalyzeRes | null>(null);
  const [loading, setLoading] = useState(false);
  const year = month.year();
  const monthNumber = month.month() + 1;
  const timezoneOffsetMinutes = new Date().getTimezoneOffset();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    post<ITimeEntryAnalyzeReq, ITimeEntryAnalyzeRes>('/api/time-entry/analyze', {
      year,
      month: monthNumber,
      activityTypeId,
      timezoneOffsetMinutes,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            timeEntries: [],
            totalMinutes: 0,
            recordedDays: 0,
            activitySummaries: [],
            dailySummaries: [],
            rhythmSegments: [],
            sleepSamples: [],
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [year, monthNumber, refreshKey, activityTypeId, timezoneOffsetMinutes]);

  return { data, loading };
};
