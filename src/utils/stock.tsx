import { useEffect } from 'react';
import {
  IStockCashUpdateReq,
  IStockDividendMarkingUpdateReq,
  IStockHoldingDeleteReq,
  IStockHoldingUpdateReq,
  IStockQuoteRefreshReq,
  IStockRebalanceSaveReq,
  IStockRemarkCreateReq,
  IStockRemarkDeleteReq,
  IStockRemarkUpdateReq,
  IStockSearchReq,
  IStockSnapshotCreateReq,
} from '@dtos/meow';
import { useStockStore } from '@stores/stock-store-context';

export const useStockPortfolio = (refreshKey = 0) => {
  const stockStore = useStockStore();

  useEffect(() => {
    void stockStore.loadPortfolio({}, { force: refreshKey > 0 });
  }, [refreshKey, stockStore]);

  const hasLoaded = stockStore.portfolioStatus.updatedAt != null || stockStore.portfolioStatus.error != null;

  return {
    data: stockStore.portfolio,
    loading: stockStore.portfolioStatus.loading || (!hasLoaded && !stockStore.portfolio),
    refreshing: stockStore.portfolioStatus.refreshing,
    reQuery: (params: IStockSearchReq = {}) => stockStore.refreshPortfolio(params),
    refreshQuotes: (params: IStockQuoteRefreshReq = {}) => stockStore.refreshQuotes(params),
    updateCash: (params: IStockCashUpdateReq) => stockStore.updateCash(params),
    saveRebalance: (params: IStockRebalanceSaveReq) => stockStore.saveRebalance(params),
    updateHolding: (params: IStockHoldingUpdateReq) => stockStore.updateHolding(params),
    deleteHolding: (params: IStockHoldingDeleteReq) => stockStore.deleteHolding(params),
    updating: stockStore.portfolioUpdating,
    quoteRefreshing: stockStore.quoteRefreshing,
  };
};

export const useStockAiReports = (refreshKey = 0, symbol?: string) => {
  const stockStore = useStockStore();

  useEffect(() => {
    void stockStore.loadReports(symbol, { force: refreshKey > 0 });
  }, [refreshKey, stockStore, symbol]);

  const status = stockStore.getReportStatus(symbol);
  const reports = stockStore.getReports(symbol);
  const hasLoaded = status.updatedAt != null || status.error != null;

  return {
    reports,
    loading: status.loading || (!hasLoaded && reports.length === 0),
    refreshing: status.refreshing,
    reQuery: () => stockStore.loadReports(symbol, { force: true }),
  };
};

export const useStockAiPrompt = (symbol: string, refreshKey = 0) => {
  const stockStore = useStockStore();

  useEffect(() => {
    if (!symbol) return;
    void stockStore.loadPrompt(symbol, { force: refreshKey > 0 }).catch(() => undefined);
  }, [refreshKey, stockStore, symbol]);

  const status = stockStore.getPromptStatus(symbol);

  return {
    data: symbol ? stockStore.getPrompt(symbol) : null,
    loading: status.loading,
    refreshing: status.refreshing,
    error: status.error,
    reQuery: () => stockStore.loadPrompt(symbol, { force: true }),
  };
};

export const useStockRemarks = (symbol: string, refreshKey = 0) => {
  const stockStore = useStockStore();

  useEffect(() => {
    if (!symbol) return;
    void stockStore.loadRemarks(symbol, { force: refreshKey > 0 });
  }, [refreshKey, stockStore, symbol]);

  const status = stockStore.getRemarkStatus(symbol);

  return {
    remarks: symbol ? stockStore.getRemarks(symbol) : [],
    symbolName: symbol ? stockStore.getRemarkSymbolName(symbol) : '',
    loading: status.loading,
    refreshing: status.refreshing,
    reQuery: () => stockStore.loadRemarks(symbol, { force: true }),
    createRemark: (params: IStockRemarkCreateReq) => stockStore.createRemark(params),
    updateRemark: (params: IStockRemarkUpdateReq) => stockStore.updateRemark(symbol, params),
    deleteRemark: (params: IStockRemarkDeleteReq) => stockStore.deleteRemark(symbol, params),
  };
};

export const useStockDividends = (symbol: string, refreshKey = 0) => {
  const stockStore = useStockStore();

  useEffect(() => {
    if (!symbol) return;
    void stockStore.loadDividends(symbol, { force: refreshKey > 0 });
  }, [refreshKey, stockStore, symbol]);

  const status = stockStore.getDividendStatus(symbol);

  return {
    events: symbol ? stockStore.getDividends(symbol) : [],
    loading: status.loading,
    refreshing: status.refreshing,
    reQuery: () => stockStore.loadDividends(symbol, { force: true }),
    updateMarking: (params: IStockDividendMarkingUpdateReq) => stockStore.updateDividendMarking(symbol, params),
  };
};

export const useStockFinancialStatements = (symbol: string, refreshKey = 0, limit = 5) => {
  const stockStore = useStockStore();

  useEffect(() => {
    if (!symbol) return;
    void stockStore.loadFinancialStatements(symbol, limit, { force: refreshKey > 0 }).catch(() => undefined);
  }, [refreshKey, stockStore, symbol, limit]);

  const status = stockStore.getFinancialStatementStatus(symbol, limit);

  return {
    data: symbol ? stockStore.getFinancialStatements(symbol, limit) : null,
    loading: status.loading,
    refreshing: status.refreshing,
    error: status.error,
    reQuery: () => stockStore.loadFinancialStatements(symbol, limit, { force: true }),
  };
};

export const useStockSnapshots = (refreshKey = 0, limit = 120) => {
  const stockStore = useStockStore();

  useEffect(() => {
    void stockStore.loadSnapshots(limit, { force: refreshKey > 0 });
  }, [refreshKey, stockStore, limit]);

  return {
    snapshots: stockStore.snapshots,
    loading: stockStore.snapshotsStatus.loading,
    refreshing: stockStore.snapshotsStatus.refreshing,
    reQuery: () => stockStore.loadSnapshots(limit, { force: true }),
    createSnapshot: (params: IStockSnapshotCreateReq = {}) => stockStore.createSnapshot(params),
    saving: stockStore.snapshotSaving,
  };
};

export const useStockSnapshotDetail = (snapshotId: number | null) => {
  const stockStore = useStockStore();

  useEffect(() => {
    void stockStore.loadSnapshotDetail(snapshotId);
  }, [snapshotId, stockStore]);

  const status = stockStore.getSnapshotDetailStatus(snapshotId);

  return {
    snapshot: stockStore.getSnapshotDetail(snapshotId),
    loading: status.loading,
    refreshing: status.refreshing,
    reQuery: () => stockStore.loadSnapshotDetail(snapshotId, { force: true }),
  };
};
