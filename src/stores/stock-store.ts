import { makeAutoObservable, runInAction } from 'mobx';
import { post } from '@libs/fetch';
import {
  ResourceStatus,
  createStatus,
  dedupeRequest,
  getMapStatus,
  markStatusError,
  markStatusSuccess,
  setStatus,
} from '@stores/store-resource';
import {
  IStockAiReportListReq,
  IStockAiReportListRes,
  IStockCashUpdateReq,
  IStockCashUpdateRes,
  IStockDividendListReq,
  IStockDividendMarkingUpdateReq,
  IStockDividendMarkingUpdateRes,
  IStockDividendListRes,
  IStockFinancialStatementListReq,
  IStockFinancialStatementListRes,
  IStockHoldingDeleteReq,
  IStockHoldingUpdateReq,
  IStockHoldingUpdateRes,
  IStockQuoteRefreshReq,
  IStockQuoteRefreshRes,
  IStockRebalanceSaveReq,
  IStockRebalanceSaveRes,
  IStockRemarkCreateReq,
  IStockRemarkCreateRes,
  IStockRemarkDeleteReq,
  IStockRemarkDeleteRes,
  IStockRemarkListReq,
  IStockRemarkListRes,
  IStockRemarkUpdateReq,
  IStockRemarkUpdateRes,
  IStockSearchReq,
  IStockSearchRes,
  IStockSnapshotCreateReq,
  IStockSnapshotCreateRes,
  IStockSnapshotDetailReq,
  IStockSnapshotDetailRes,
  IStockSnapshotListReq,
  IStockSnapshotListRes,
  IStockSymbolVisibilityUpdateReq,
  IStockSymbolVisibilityUpdateRes,
  StockDividendEventWithMarking,
  StockSnapshotDetail,
} from '@dtos/meow';

const reportKey = (symbol?: string) => symbol?.toUpperCase() ?? '__all__';
const financialStatementsKey = (symbol: string, limit: number) => `${symbol.toUpperCase()}:${limit}`;

export class StockStore {
  portfolio: IStockSearchRes | null = null;
  portfolioStatus = createStatus();
  portfolioUpdating = false;
  quoteRefreshing = false;

  snapshots: IStockSnapshotListRes['snapshots'] = [];
  snapshotsStatus = createStatus();
  snapshotSaving = false;
  snapshotDetailsById = new Map<number, StockSnapshotDetail>();
  snapshotDetailStatuses = new Map<number, ResourceStatus>();

  reportsByKey = new Map<string, IStockAiReportListRes['reports']>();
  reportStatuses = new Map<string, ResourceStatus>();

  remarksBySymbol = new Map<string, IStockRemarkListRes>();
  remarkStatuses = new Map<string, ResourceStatus>();

  dividendsBySymbol = new Map<string, StockDividendEventWithMarking[]>();
  dividendStatuses = new Map<string, ResourceStatus>();

  financialStatementsByKey = new Map<string, IStockFinancialStatementListRes>();
  financialStatementStatuses = new Map<string, ResourceStatus>();

  private inflight = new Map<string, Promise<unknown>>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  getSnapshotDetail(snapshotId: number | null) {
    return snapshotId == null ? null : this.snapshotDetailsById.get(snapshotId) ?? null;
  }

  getSnapshotDetailStatus(snapshotId: number | null) {
    if (snapshotId == null) return createStatus();
    return getMapStatus(this.snapshotDetailStatuses, snapshotId);
  }

  getReports(symbol?: string) {
    return this.reportsByKey.get(reportKey(symbol)) ?? [];
  }

  getReportStatus(symbol?: string) {
    return getMapStatus(this.reportStatuses, reportKey(symbol));
  }

  getRemarks(symbol: string) {
    return this.remarksBySymbol.get(symbol.toUpperCase())?.remarks ?? [];
  }

  getRemarkSymbolName(symbol: string) {
    return this.remarksBySymbol.get(symbol.toUpperCase())?.name ?? symbol;
  }

  getRemarkStatus(symbol: string) {
    return getMapStatus(this.remarkStatuses, symbol.toUpperCase());
  }

  getDividends(symbol: string) {
    return this.dividendsBySymbol.get(symbol.toUpperCase()) ?? [];
  }

  getDividendStatus(symbol: string) {
    return getMapStatus(this.dividendStatuses, symbol.toUpperCase());
  }

  getFinancialStatements(symbol: string, limit: number) {
    return this.financialStatementsByKey.get(financialStatementsKey(symbol, limit)) ?? null;
  }

  getFinancialStatementStatus(symbol: string, limit: number) {
    return getMapStatus(this.financialStatementStatuses, financialStatementsKey(symbol, limit));
  }

  loadPortfolio(params: IStockSearchReq = {}, options: { force?: boolean } = {}) {
    const key = `portfolio:${JSON.stringify(params)}`;
    if (this.portfolio && !options.force) {
      return Promise.resolve(this.portfolio);
    }
    return this.fetchPortfolio(key, params, Boolean(this.portfolio));
  }

  refreshPortfolio(params: IStockSearchReq = {}) {
    return this.fetchPortfolio(`portfolio:${JSON.stringify(params)}`, params, true);
  }

  refreshQuotes(params: IStockQuoteRefreshReq = {}) {
    return dedupeRequest(this.inflight, `quote-refresh:${JSON.stringify(params)}`, async () => {
      runInAction(() => {
        this.quoteRefreshing = true;
      });
      try {
        const res = await post<IStockQuoteRefreshReq, IStockQuoteRefreshRes>('/api/stock/quote/refresh', params);
        await this.refreshPortfolio();
        return res;
      } finally {
        runInAction(() => {
          this.quoteRefreshing = false;
        });
      }
    });
  }

  async updateCash(payload: IStockCashUpdateReq) {
    this.portfolioUpdating = true;
    try {
      const res = await post<IStockCashUpdateReq, IStockCashUpdateRes>('/api/stock/cash/update', payload);
      await this.refreshPortfolio();
      return res;
    } finally {
      runInAction(() => {
        this.portfolioUpdating = false;
      });
    }
  }

  async saveRebalance(payload: IStockRebalanceSaveReq) {
    this.portfolioUpdating = true;
    try {
      const res = await post<IStockRebalanceSaveReq, IStockRebalanceSaveRes>('/api/stock/rebalance/save', payload);
      await this.refreshPortfolio();
      return res;
    } finally {
      runInAction(() => {
        this.portfolioUpdating = false;
      });
    }
  }

  async updateHolding(payload: IStockHoldingUpdateReq) {
    this.portfolioUpdating = true;
    try {
      return await post<IStockHoldingUpdateReq, IStockHoldingUpdateRes>('/api/stock/holding/update', payload);
    } finally {
      runInAction(() => {
        this.portfolioUpdating = false;
      });
    }
  }

  async deleteHolding(payload: IStockHoldingDeleteReq) {
    this.portfolioUpdating = true;
    try {
      const res = await post<IStockHoldingDeleteReq, { id: number }>('/api/stock/holding/delete', payload);
      await this.refreshPortfolio();
      return res;
    } finally {
      runInAction(() => {
        this.portfolioUpdating = false;
      });
    }
  }

  async updateSymbolVisibility(payload: IStockSymbolVisibilityUpdateReq) {
    const res = await post<IStockSymbolVisibilityUpdateReq, IStockSymbolVisibilityUpdateRes>('/api/stock/symbol-visibility/update', payload);
    runInAction(() => {
      if (!this.portfolio) return;
      const hiddenSymbols = new Set(this.portfolio.hiddenSymbols ?? []);
      if (res.isHidden) hiddenSymbols.add(res.symbol);
      else hiddenSymbols.delete(res.symbol);
      this.portfolio = {
        ...this.portfolio,
        hiddenSymbols: [...hiddenSymbols].sort(),
      };
    });
    return res;
  }

  loadSnapshots(limit = 120, options: { force?: boolean } = {}) {
    const key = `snapshots:${limit}`;
    if (this.snapshots.length > 0 && !options.force) {
      return Promise.resolve({ snapshots: this.snapshots });
    }
    return this.fetchSnapshots(key, limit, this.snapshots.length > 0);
  }

  loadSnapshotDetail(snapshotId: number | null, options: { force?: boolean } = {}) {
    if (!snapshotId) return Promise.resolve(null);
    const key = `snapshot-detail:${snapshotId}`;
    const existing = this.snapshotDetailsById.get(snapshotId) ?? null;
    if (existing && !options.force) {
      return Promise.resolve(existing);
    }
    return this.fetchSnapshotDetail(key, snapshotId, Boolean(existing));
  }

  async createSnapshot(payload: IStockSnapshotCreateReq = {}) {
    this.snapshotSaving = true;
    try {
      const res = await post<IStockSnapshotCreateReq, IStockSnapshotCreateRes>('/api/stock/snapshot/create', payload);
      if (res.status === 'created' && res.snapshot) {
        await this.loadSnapshots(120, { force: true });
      }
      return res;
    } finally {
      runInAction(() => {
        this.snapshotSaving = false;
      });
    }
  }

  loadReports(symbol?: string, options: { force?: boolean } = {}) {
    const key = reportKey(symbol);
    const inflightKey = `reports:${key}`;
    const existing = this.reportsByKey.get(key);
    if (existing && !options.force) {
      return Promise.resolve({ reports: existing });
    }
    return this.fetchReports(inflightKey, symbol, Boolean(existing));
  }

  loadRemarks(symbol: string, options: { force?: boolean } = {}) {
    const normalized = symbol.toUpperCase();
    const existing = this.remarksBySymbol.get(normalized) ?? null;
    if (existing && !options.force) {
      return Promise.resolve(existing);
    }
    return this.fetchRemarks(`remarks:${normalized}`, normalized, Boolean(existing));
  }

  loadDividends(symbol: string, options: { force?: boolean } = {}) {
    const normalized = symbol.toUpperCase();
    const existing = this.dividendsBySymbol.get(normalized);
    if (existing && !options.force) {
      return Promise.resolve({ events: existing });
    }
    return this.fetchDividends(`dividends:${normalized}`, normalized, Boolean(existing));
  }

  setDividends(symbol: string, events: StockDividendEventWithMarking[]) {
    this.dividendsBySymbol.set(symbol.toUpperCase(), events);
  }

  async updateDividendMarking(symbol: string, payload: IStockDividendMarkingUpdateReq) {
    const res = await post<IStockDividendMarkingUpdateReq, IStockDividendMarkingUpdateRes>('/api/stock/dividend/marking/update', payload);
    runInAction(() => {
      const normalized = symbol.toUpperCase();
      const events = this.dividendsBySymbol.get(normalized) ?? [];
      this.dividendsBySymbol.set(normalized, events.map((item) =>
        item.id === res.eventId
          ? { ...item, marking: { countTowardNormalizedDividend: res.countTowardNormalizedDividend, note: res.note } }
          : item
      ));
    });
    void this.refreshPortfolio();
    return res;
  }

  async createRemark(payload: IStockRemarkCreateReq) {
    const res = await post<IStockRemarkCreateReq, IStockRemarkCreateRes>('/api/stock/remark/create', payload);
    await this.loadRemarks(payload.symbol, { force: true });
    return res;
  }

  async updateRemark(symbol: string, payload: IStockRemarkUpdateReq) {
    const res = await post<IStockRemarkUpdateReq, IStockRemarkUpdateRes>('/api/stock/remark/update', payload);
    await this.loadRemarks(symbol, { force: true });
    return res;
  }

  async deleteRemark(symbol: string, payload: IStockRemarkDeleteReq) {
    const res = await post<IStockRemarkDeleteReq, IStockRemarkDeleteRes>('/api/stock/remark/delete', payload);
    await this.loadRemarks(symbol, { force: true });
    return res;
  }

  loadFinancialStatements(symbol: string, limit = 5, options: { force?: boolean } = {}) {
    const key = financialStatementsKey(symbol, limit);
    const existing = this.financialStatementsByKey.get(key) ?? null;
    if (existing && !options.force) {
      return Promise.resolve(existing);
    }
    return this.fetchFinancialStatements(`financial-statements:${key}`, symbol, limit, Boolean(existing));
  }

  private fetchPortfolio(key: string, params: IStockSearchReq, background: boolean) {
    setStatus(this.portfolioStatus, background ? 'refreshing' : 'loading', true);
    return dedupeRequest(this.inflight, key, async () => {
      try {
        const res = await post<IStockSearchReq, IStockSearchRes>('/api/stock/search', params);
        runInAction(() => {
          this.portfolio = res;
          markStatusSuccess(this.portfolioStatus);
        });
        return res;
      } catch (error) {
        runInAction(() => markStatusError(this.portfolioStatus, error));
        throw error;
      }
    });
  }

  private fetchSnapshots(key: string, limit: number, background: boolean) {
    setStatus(this.snapshotsStatus, background ? 'refreshing' : 'loading', true);
    return dedupeRequest(this.inflight, key, async () => {
      try {
        const res = await post<IStockSnapshotListReq, IStockSnapshotListRes>('/api/stock/snapshot/list', { limit });
        runInAction(() => {
          this.snapshots = res.snapshots;
          markStatusSuccess(this.snapshotsStatus);
        });
        return res;
      } catch (error) {
        runInAction(() => markStatusError(this.snapshotsStatus, error));
        throw error;
      }
    });
  }

  private fetchSnapshotDetail(key: string, snapshotId: number, background: boolean) {
    const status = getMapStatus(this.snapshotDetailStatuses, snapshotId);
    setStatus(status, background ? 'refreshing' : 'loading', true);
    return dedupeRequest(this.inflight, key, async () => {
      try {
        const res = await post<IStockSnapshotDetailReq, IStockSnapshotDetailRes>('/api/stock/snapshot/detail', { id: snapshotId });
        runInAction(() => {
          this.snapshotDetailsById.set(snapshotId, res.snapshot);
          markStatusSuccess(status);
        });
        return res.snapshot;
      } catch (error) {
        runInAction(() => markStatusError(status, error));
        throw error;
      }
    });
  }

  private fetchReports(key: string, symbol: string | undefined, background: boolean) {
    const normalizedKey = reportKey(symbol);
    const status = getMapStatus(this.reportStatuses, normalizedKey);
    setStatus(status, background ? 'refreshing' : 'loading', true);
    return dedupeRequest(this.inflight, key, async () => {
      try {
        const res = await post<IStockAiReportListReq, IStockAiReportListRes>('/api/stock/ai-report/list', { symbol });
        runInAction(() => {
          this.reportsByKey.set(normalizedKey, res.reports);
          markStatusSuccess(status);
        });
        return res;
      } catch (error) {
        runInAction(() => markStatusError(status, error));
        throw error;
      }
    });
  }

  private fetchRemarks(key: string, symbol: string, background: boolean) {
    const status = getMapStatus(this.remarkStatuses, symbol);
    setStatus(status, background ? 'refreshing' : 'loading', true);
    return dedupeRequest(this.inflight, key, async () => {
      try {
        const res = await post<IStockRemarkListReq, IStockRemarkListRes>('/api/stock/remark/list', { symbol });
        runInAction(() => {
          this.remarksBySymbol.set(symbol, res);
          markStatusSuccess(status);
        });
        return res;
      } catch (error) {
        runInAction(() => markStatusError(status, error));
        throw error;
      }
    });
  }

  private fetchDividends(key: string, symbol: string, background: boolean) {
    const status = getMapStatus(this.dividendStatuses, symbol);
    setStatus(status, background ? 'refreshing' : 'loading', true);
    return dedupeRequest(this.inflight, key, async () => {
      try {
        const res = await post<IStockDividendListReq, IStockDividendListRes>('/api/stock/dividend/events', { symbol });
        runInAction(() => {
          this.dividendsBySymbol.set(symbol, res.events);
          markStatusSuccess(status);
        });
        return res;
      } catch (error) {
        runInAction(() => markStatusError(status, error));
        throw error;
      }
    });
  }

  private fetchFinancialStatements(key: string, symbol: string, limit: number, background: boolean) {
    const dataKey = financialStatementsKey(symbol, limit);
    const status = getMapStatus(this.financialStatementStatuses, dataKey);
    setStatus(status, background ? 'refreshing' : 'loading', true);
    return dedupeRequest(this.inflight, key, async () => {
      try {
        const res = await post<IStockFinancialStatementListReq, IStockFinancialStatementListRes>('/api/stock/financial-statement/list', { symbol, limit });
        runInAction(() => {
          this.financialStatementsByKey.set(dataKey, res);
          markStatusSuccess(status);
        });
        return res;
      } catch (error) {
        runInAction(() => markStatusError(status, error));
        throw error;
      }
    });
  }
}
