import { useEffect, useState } from 'react';
import { post } from '@libs/fetch';
import {
  IStockAiReportListReq,
  IStockAiReportListRes,
  IUserLifeAnalysisReportListReq,
  IUserLifeAnalysisReportListRes,
  IStockAiReportSourceLink,
} from '@dtos/meow';

export type AiReportKind = 'stock' | 'life';

export interface AiReportListItem {
  reportKey: string;
  kind: AiReportKind;
  badge: string;
  title: string;
  summary: string;
  content: string;
  reportDate: string;
  sourceLinks: IStockAiReportSourceLink[];
}

export const useAiReports = (refreshKey = 0) => {
  const [reports, setReports] = useState<AiReportListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const timezoneOffsetMinutes = new Date().getTimezoneOffset();
      const [stockRes, lifeRes] = await Promise.all([
        post<IStockAiReportListReq, IStockAiReportListRes>('/api/stock/ai-report/list', {}),
        post<IUserLifeAnalysisReportListReq, IUserLifeAnalysisReportListRes>('/api/life-analysis/report/list', {
          ensureLatest: true,
          timezoneOffsetMinutes,
        }),
      ]);
      const stockReports: AiReportListItem[] = stockRes.reports.map((report) => ({
        reportKey: `stock-${report.id}`,
        kind: 'stock',
        badge: report.symbol,
        title: report.title,
        summary: report.summary,
        content: report.content,
        reportDate: report.reportDate,
        sourceLinks: report.sourceLinks,
      }));
      const lifeReports: AiReportListItem[] = lifeRes.reports.map((report) => ({
        reportKey: `life-${report.id}`,
        kind: 'life',
        badge: '作息',
        title: report.title,
        summary: report.summary,
        content: report.content,
        reportDate: report.periodEnd,
        sourceLinks: [],
      }));
      const nextReports = [...lifeReports, ...stockReports].sort((left, right) => (
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