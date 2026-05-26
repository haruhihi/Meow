import { useEffect, useState } from 'react';
import { post } from '@libs/fetch';
import {
  IUserLifeAnalysisReportListReq,
  IUserLifeAnalysisReportListRes,
} from '@dtos/meow';

export interface LifeReportListItem {
  reportKey: string;
  badge: string;
  title: string;
  summary: string;
  content: string;
  reportDate: string;
}

export const useLifeReports = (refreshKey = 0) => {
  const [reports, setReports] = useState<LifeReportListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const timezoneOffsetMinutes = new Date().getTimezoneOffset();
      const lifeRes = await post<IUserLifeAnalysisReportListReq, IUserLifeAnalysisReportListRes>('/api/life-analysis/report/list', {
        ensureLatest: true,
        timezoneOffsetMinutes,
      });
      const lifeReports: LifeReportListItem[] = lifeRes.reports.map((report) => ({
        reportKey: `life-${report.id}`,
        badge: '作息',
        title: report.title,
        summary: report.summary,
        content: report.content,
        reportDate: report.periodEnd,
      }));
      const nextReports = lifeReports.sort((left, right) => (
        new Date(right.reportDate).getTime() - new Date(left.reportDate).getTime()
      ));
      setReports(nextReports);
      return nextReports;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReports();
  }, [refreshKey]);

  return {
    reports,
    loading,
    reQuery: fetchReports,
  };
};