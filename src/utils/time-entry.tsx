import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { post } from '@libs/fetch';
import {
  IActivityTypeListRes,
  ITimeActivityGroupListRes,
  ITimeEntryAnalyzeReq,
  ITimeEntryAnalyzeRes,
  ITimeEntrySearchReq,
  ITimeEntrySearchRes,
} from '@dtos/meow';

const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 15;

const EMPTY_ANALYZE_DATA: ITimeEntryAnalyzeRes = {
  groupSummaries: [],
  recordedDays: 0,
  dailySummaries: [],
  hourlySummaries: [],
};

export const useActivityTypes = (refreshKey = 0) => {
  const [activityTypes, setActivityTypes] = useState<IActivityTypeListRes['activityTypes']>();

  const fetchActivityTypes = async () => {
    const res = await post<null, IActivityTypeListRes>('/api/time/activity-type/list', null);
    setActivityTypes(res.activityTypes);
  };

  useEffect(() => {
    void fetchActivityTypes();
  }, [refreshKey]);

  return {
    activityTypes,
    reQuery: fetchActivityTypes,
  };
};

export const useTimeActivityGroups = (enabled: boolean) => {
  const [groups, setGroups] = useState<ITimeActivityGroupListRes['groups']>();

  const fetchGroups = async () => {
    const res = await post<null, ITimeActivityGroupListRes>('/api/time/activity-group/list', null);
    setGroups(res.groups);
  };

  useEffect(() => {
    if (!enabled) return;
    void fetchGroups();
  }, [enabled]);

  return {
    groups,
    reQuery: fetchGroups,
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
    void fetchTimeEntries(DEFAULT_PAGE);
  }, []);

  return {
    timeEntries,
    loadMore: async () => fetchTimeEntries(page + 1),
    hasMore,
    reQuery: async () => {
      setPage(DEFAULT_PAGE);
      setHasMore(true);
      await fetchTimeEntries(DEFAULT_PAGE);
    },
  };
};

export const useTimeRangeAnalyze = (
  startedAt: dayjs.Dayjs,
  endedAt: dayjs.Dayjs,
  refreshKey = 0,
  includeHourly = false,
  enabled = true
) => {
  const [data, setData] = useState<ITimeEntryAnalyzeRes | null>(null);
  const [loading, setLoading] = useState(false);
  const startedAtMs = startedAt.valueOf();
  const endedAtMs = endedAt.valueOf();
  const timezoneOffsetMinutes = new Date().getTimezoneOffset();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    post<ITimeEntryAnalyzeReq, ITimeEntryAnalyzeRes>('/api/time-entry/analyze', {
      startedAt: startedAtMs,
      endedAt: endedAtMs,
      timezoneOffsetMinutes,
      includeHourly,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(EMPTY_ANALYZE_DATA);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [startedAtMs, endedAtMs, refreshKey, includeHourly, timezoneOffsetMinutes, enabled]);

  return { data, loading };
};