import { useEffect, useState } from 'react';
import { post } from '@libs/fetch';
import {
  IStockAiReportListReq,
  IStockAiReportListRes,
  IStockQuoteRefreshReq,
  IStockQuoteRefreshRes,
  IStockSearchReq,
  IStockSearchRes,
  IStockSnapshotListReq,
  IStockSnapshotListRes,
} from '@dtos/meow';

export const useStockPortfolio = (refreshKey = 0) => {
  const [data, setData] = useState<IStockSearchRes | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPortfolio = async (params: IStockSearchReq = {}) => {
    setLoading(true);
    try {
      const res = await post<IStockSearchReq, IStockSearchRes>('/api/stock/search', params);
      setData(res);
      return res;
    } finally {
      setLoading(false);
    }
  };

  const refreshQuotes = () => post<IStockQuoteRefreshReq, IStockQuoteRefreshRes>('/api/stock/quote/refresh', {});

  useEffect(() => {
    void fetchPortfolio();
  }, [refreshKey]);

  return {
    data,
    loading,
    reQuery: fetchPortfolio,
    refreshQuotes,
  };
};

export const useStockAiReports = (refreshKey = 0, symbol?: string) => {
  const [reports, setReports] = useState<IStockAiReportListRes['reports']>([]);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await post<IStockAiReportListReq, IStockAiReportListRes>('/api/stock/ai-report/list', { symbol });
      setReports(res.reports);
      return res;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReports();
  }, [refreshKey, symbol]);

  return {
    reports,
    loading,
    reQuery: fetchReports,
  };
};

export const useStockSnapshots = (refreshKey = 0, limit = 120) => {
  const [snapshots, setSnapshots] = useState<IStockSnapshotListRes['snapshots']>([]);
  const [loading, setLoading] = useState(false);

  const fetchSnapshots = async () => {
    setLoading(true);
    try {
      const res = await post<IStockSnapshotListReq, IStockSnapshotListRes>('/api/stock/snapshot/list', { limit });
      setSnapshots(res.snapshots);
      return res;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSnapshots();
  }, [refreshKey, limit]);

  return {
    snapshots,
    loading,
    reQuery: fetchSnapshots,
  };
};
