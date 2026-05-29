import { useEffect, useState } from 'react';
import { post } from '@libs/fetch';
import {
  IStockAiReportListReq,
  IStockAiReportListRes,
  IStockAiPromptReq,
  IStockAiPromptRes,
  IStockFinancialStatementListReq,
  IStockFinancialStatementListRes,
  IStockQuoteRefreshReq,
  IStockQuoteRefreshRes,
  IStockRemarkListReq,
  IStockRemarkListRes,
  IStockSearchReq,
  IStockSearchRes,
  IStockSnapshotDetailReq,
  IStockSnapshotDetailRes,
  IStockSnapshotListReq,
  IStockSnapshotListRes,
  StockSnapshotDetail,
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

export const useStockAiPrompt = (symbol: string, refreshKey = 0) => {
  const [data, setData] = useState<IStockAiPromptRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrompt = async () => {
    if (!symbol) {
      setData(null);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await post<IStockAiPromptReq, IStockAiPromptRes>('/api/stock/ai-report/prompt', { symbol });
      setData(res);
      return res;
    } catch (err) {
      const message = (err as any)?.result ?? String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPrompt().catch(() => undefined);
  }, [refreshKey, symbol]);

  return {
    data,
    loading,
    error,
    reQuery: fetchPrompt,
  };
};

export const useStockRemarks = (symbol: string, refreshKey = 0) => {
  const [remarks, setRemarks] = useState<IStockRemarkListRes['remarks']>([]);
  const [symbolName, setSymbolName] = useState(symbol);
  const [loading, setLoading] = useState(false);

  const fetchRemarks = async () => {
    if (!symbol) {
      setRemarks([]);
      setSymbolName('');
      return null;
    }

    setLoading(true);
    try {
      const res = await post<IStockRemarkListReq, IStockRemarkListRes>('/api/stock/remark/list', { symbol });
      setRemarks(res.remarks);
      setSymbolName(res.name);
      return res;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRemarks();
  }, [refreshKey, symbol]);

  return {
    remarks,
    symbolName,
    loading,
    reQuery: fetchRemarks,
  };
};

export const useStockFinancialStatements = (symbol: string, refreshKey = 0, limit = 5) => {
  const [data, setData] = useState<IStockFinancialStatementListRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatements = async () => {
    if (!symbol) {
      setData(null);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await post<IStockFinancialStatementListReq, IStockFinancialStatementListRes>('/api/stock/financial-statement/list', { symbol, limit });
      setData(res);
      return res;
    } catch (err) {
      const message = (err as any)?.result ?? String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatements().catch(() => undefined);
  }, [refreshKey, symbol, limit]);

  return {
    data,
    loading,
    error,
    reQuery: fetchStatements,
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

export const useStockSnapshotDetail = (snapshotId: number | null) => {
  const [snapshot, setSnapshot] = useState<StockSnapshotDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSnapshot = async () => {
    if (!snapshotId) {
      setSnapshot(null);
      return null;
    }

    setLoading(true);
    try {
      const res = await post<IStockSnapshotDetailReq, IStockSnapshotDetailRes>('/api/stock/snapshot/detail', { id: snapshotId });
      setSnapshot(res.snapshot);
      return res;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSnapshot();
  }, [snapshotId]);

  return {
    snapshot,
    loading,
    reQuery: fetchSnapshot,
  };
};
