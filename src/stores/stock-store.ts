import { makeAutoObservable, runInAction } from 'mobx';
import { post } from '@libs/fetch';
import {
  IStockAiPromptReq,
  IStockAiPromptRes,
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
  StockDividendEventWithMarking,
  StockSnapshotDetail,
} from '@dtos/meow';

type ResourceStatus = {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  updatedAt: number | null;
};

const createStatus = (): ResourceStatus => ({
  loading: false,
  refreshing: false,
  error: null,
  updatedAt: null,
});

const getErrorMessage = (error: unknown) => (error as any)?.result ?? (error instanceof Error ? error.message : String(error));
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

  promptsBySymbol = new Map<string, IStockAiPromptRes>();
  promptStatuses = new Map<string, ResourceStatus>();

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
    return this.getMapStatus(this.snapshotDetailStatuses, snapshotId);
  }

  getReports(symbol?: string) {
    return this.reportsByKey.get(reportKey(symbol)) ?? [];
  }

  getReportStatus(symbol?: string) {
    return this.getMapStatus(this.reportStatuses, reportKey(symbol));
  }

  getPrompt(symbol: string) {
    return this.promptsBySymbol.get(symbol.toUpperCase()) ?? null;
  }

  getPromptStatus(symbol: string) {
    return this.getMapStatus(this.promptStatuses, symbol.toUpperCase());
  }

  getRemarks(symbol: string) {
    return this.remarksBySymbol.get(symbol.toUpperCase())?.remarks ?? [];
  }

  getRemarkSymbolName(symbol: string) {
    return this.remarksBySymbol.get(symbol.toUpperCase())?.name ?? symbol;
  }

  getRemarkStatus(symbol: string) {
    return this.getMapStatus(this.remarkStatuses, symbol.toUpperCase());
  }

  getDividends(symbol: string) {
    return this.dividendsBySymbol.get(symbol.toUpperCase()) ?? [];
  }

  getDividendStatus(symbol: string) {
    return this.getMapStatus(this.dividendStatuses, symbol.toUpperCase());
  }

  getFinancialStatements(symbol: string, limit: number) {
    return this.financialStatementsByKey.get(financialStatementsKey(symbol, limit)) ?? null;
  }

  getFinancialStatementStatus(symbol: string, limit: number) {
    return this.getMapStatus(this.financialStatementStatuses, financialStatementsKey(symbol, limit));
  }

  loadPortfolio(params: IStockSearchReq = {}, options: { force?: boolean; background?: boolean } = {}) {
    const key = `portfolio:${JSON.stringify(params)}`;
    if (this.portfolio && !options.force) {
      if (options.background) void this.fetchPortfolio(key, params, true);
      return Promise.resolve(this.portfolio);
    }
    return this.fetchPortfolio(key, params, Boolean(this.portfolio));
  }

  refreshPortfolio(params: IStockSearchReq = {}) {
    return this.fetchPortfolio(`portfolio:${JSON.stringify(params)}`, params, true);
  }

  refreshQuotes(params: IStockQuoteRefreshReq = {}) {
    return this.dedupe(`quote-refresh:${JSON.stringify(params)}`, async () => {
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

  loadSnapshots(limit = 120, options: { force?: boolean; background?: boolean } = {}) {
    const key = `snapshots:${limit}`;
    if (this.snapshots.length > 0 && !options.force) {
      if (options.background) void this.fetchSnapshots(key, limit, true);
      return Promise.resolve({ snapshots: this.snapshots });
    }
    return this.fetchSnapshots(key, limit, this.snapshots.length > 0);
  }

  loadSnapshotDetail(snapshotId: number | null, options: { force?: boolean; background?: boolean } = {}) {
    if (!snapshotId) return Promise.resolve(null);
    const key = `snapshot-detail:${snapshotId}`;
    const existing = this.snapshotDetailsById.get(snapshotId) ?? null;
    if (existing && !options.force) {
      if (options.background) void this.fetchSnapshotDetail(key, snapshotId, true);
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

  loadReports(symbol?: string, options: { force?: boolean; background?: boolean } = {}) {
    const key = reportKey(symbol);
    const inflightKey = `reports:${key}`;
    const existing = this.reportsByKey.get(key);
    if (existing && !options.force) {
      if (options.background) void this.fetchReports(inflightKey, symbol, true);
      return Promise.resolve({ reports: existing });
    }
    return this.fetchReports(inflightKey, symbol, Boolean(existing));
  }

  loadPrompt(symbol: string, options: { force?: boolean; background?: boolean } = {}) {
    const normalized = symbol.toUpperCase();
    const existing = this.promptsBySymbol.get(normalized) ?? null;
    if (existing && !options.force) {
      if (options.background) void this.fetchPrompt(`prompt:${normalized}`, normalized, true);
      return Promise.resolve(existing);
    }
    return this.fetchPrompt(`prompt:${normalized}`, normalized, Boolean(existing));
  }

  loadRemarks(symbol: string, options: { force?: boolean; background?: boolean } = {}) {
    const normalized = symbol.toUpperCase();
    const existing = this.remarksBySymbol.get(normalized) ?? null;
    if (existing && !options.force) {
      if (options.background) void this.fetchRemarks(`remarks:${normalized}`, normalized, true);
      return Promise.resolve(existing);
    }
    return this.fetchRemarks(`remarks:${normalized}`, normalized, Boolean(existing));
  }

  loadDividends(symbol: string, options: { force?: boolean; background?: boolean } = {}) {
    const normalized = symbol.toUpperCase();
    const existing = this.dividendsBySymbol.get(normalized);
    if (existing && !options.force) {
      if (options.background) void this.fetchDividends(`dividends:${normalized}`, normalized, true);
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

  loadFinancialStatements(symbol: string, limit = 5, options: { force?: boolean; background?: boolean } = {}) {
    const key = financialStatementsKey(symbol, limit);
    const existing = this.financialStatementsByKey.get(key) ?? null;
    if (existing && !options.force) {
      if (options.background) void this.fetchFinancialStatements(`financial-statements:${key}`, symbol, limit, true);
      return Promise.resolve(existing);
    }
    return this.fetchFinancialStatements(`financial-statements:${key}`, symbol, limit, Boolean(existing));
  }

  private fetchPortfolio(key: string, params: IStockSearchReq, background: boolean) {
    this.setStatus(this.portfolioStatus, background ? 'refreshing' : 'loading', true);
    return this.dedupe(key, async () => {
      try {
        const res = await post<IStockSearchReq, IStockSearchRes>('/api/stock/search', params);
        runInAction(() => {
          this.portfolio = res;
          this.markStatusSuccess(this.portfolioStatus);
        });
        return res;
      } catch (error) {
        runInAction(() => this.markStatusError(this.portfolioStatus, error));
        throw error;
      }
    });
  }

  private fetchSnapshots(key: string, limit: number, background: boolean) {
    this.setStatus(this.snapshotsStatus, background ? 'refreshing' : 'loading', true);
    return this.dedupe(key, async () => {
      try {
        const res = await post<IStockSnapshotListReq, IStockSnapshotListRes>('/api/stock/snapshot/list', { limit });
        runInAction(() => {
          this.snapshots = res.snapshots;
          this.markStatusSuccess(this.snapshotsStatus);
        });
        return res;
      } catch (error) {
        runInAction(() => this.markStatusError(this.snapshotsStatus, error));
        throw error;
      }
    });
  }

  private fetchSnapshotDetail(key: string, snapshotId: number, background: boolean) {
    const status = this.getMapStatus(this.snapshotDetailStatuses, snapshotId);
    this.setStatus(status, background ? 'refreshing' : 'loading', true);
    return this.dedupe(key, async () => {
      try {
        const res = await post<IStockSnapshotDetailReq, IStockSnapshotDetailRes>('/api/stock/snapshot/detail', { id: snapshotId });
        runInAction(() => {
          this.snapshotDetailsById.set(snapshotId, res.snapshot);
          this.markStatusSuccess(status);
        });
        return res.snapshot;
      } catch (error) {
        runInAction(() => this.markStatusError(status, error));
        throw error;
      }
    });
  }

  private fetchReports(key: string, symbol: string | undefined, background: boolean) {
    const normalizedKey = reportKey(symbol);
    const status = this.getMapStatus(this.reportStatuses, normalizedKey);
    this.setStatus(status, background ? 'refreshing' : 'loading', true);
    return this.dedupe(key, async () => {
      try {
        const res = await post<IStockAiReportListReq, IStockAiReportListRes>('/api/stock/ai-report/list', { symbol });
        runInAction(() => {
          this.reportsByKey.set(normalizedKey, res.reports);
          this.markStatusSuccess(status);
        });
        return res;
      } catch (error) {
        runInAction(() => this.markStatusError(status, error));
        throw error;
      }
    });
  }

  private fetchPrompt(key: string, symbol: string, background: boolean) {
    const status = this.getMapStatus(this.promptStatuses, symbol);
    this.setStatus(status, background ? 'refreshing' : 'loading', true);
    return this.dedupe(key, async () => {
      try {
        const res = await post<IStockAiPromptReq, IStockAiPromptRes>('/api/stock/ai-report/prompt', { symbol });
        runInAction(() => {
          this.promptsBySymbol.set(symbol, res);
          this.markStatusSuccess(status);
        });
        return res;
      } catch (error) {
        runInAction(() => this.markStatusError(status, error));
        throw error;
      }
    });
  }

  private fetchRemarks(key: string, symbol: string, background: boolean) {
    const status = this.getMapStatus(this.remarkStatuses, symbol);
    this.setStatus(status, background ? 'refreshing' : 'loading', true);
    return this.dedupe(key, async () => {
      try {
        const res = await post<IStockRemarkListReq, IStockRemarkListRes>('/api/stock/remark/list', { symbol });
        runInAction(() => {
          this.remarksBySymbol.set(symbol, res);
          this.markStatusSuccess(status);
        });
        return res;
      } catch (error) {
        runInAction(() => this.markStatusError(status, error));
        throw error;
      }
    });
  }

  private fetchDividends(key: string, symbol: string, background: boolean) {
    const status = this.getMapStatus(this.dividendStatuses, symbol);
    this.setStatus(status, background ? 'refreshing' : 'loading', true);
    return this.dedupe(key, async () => {
      try {
        const res = await post<IStockDividendListReq, IStockDividendListRes>('/api/stock/dividend/events', { symbol });
        runInAction(() => {
          this.dividendsBySymbol.set(symbol, res.events);
          this.markStatusSuccess(status);
        });
        return res;
      } catch (error) {
        runInAction(() => this.markStatusError(status, error));
        throw error;
      }
    });
  }

  private fetchFinancialStatements(key: string, symbol: string, limit: number, background: boolean) {
    const dataKey = financialStatementsKey(symbol, limit);
    const status = this.getMapStatus(this.financialStatementStatuses, dataKey);
    this.setStatus(status, background ? 'refreshing' : 'loading', true);
    return this.dedupe(key, async () => {
      try {
        const res = await post<IStockFinancialStatementListReq, IStockFinancialStatementListRes>('/api/stock/financial-statement/list', { symbol, limit });
        runInAction(() => {
          this.financialStatementsByKey.set(dataKey, res);
          this.markStatusSuccess(status);
        });
        return res;
      } catch (error) {
        runInAction(() => this.markStatusError(status, error));
        throw error;
      }
    });
  }

  private dedupe<T>(key: string, fetcher: () => Promise<T>) {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = fetcher().finally(() => {
      runInAction(() => this.inflight.delete(key));
    });
    this.inflight.set(key, promise);
    return promise;
  }

  private getMapStatus<TKey>(map: Map<TKey, ResourceStatus>, key: TKey) {
    let status = map.get(key);
    if (!status) {
      status = createStatus();
      map.set(key, status);
    }
    return status;
  }

  private setStatus(status: ResourceStatus, key: 'loading' | 'refreshing', value: boolean) {
    status[key] = value;
    status.error = null;
  }

  private markStatusSuccess(status: ResourceStatus) {
    status.loading = false;
    status.refreshing = false;
    status.error = null;
    status.updatedAt = Date.now();
  }

  private markStatusError(status: ResourceStatus, error: unknown) {
    status.loading = false;
    status.refreshing = false;
    status.error = getErrorMessage(error);
  }
}
