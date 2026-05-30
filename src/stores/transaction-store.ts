import { makeAutoObservable, runInAction } from 'mobx';
import { post } from '@libs/fetch';
import {
  ITransactionAnalyzeReq,
  ITransactionAnalyzeRes,
  ITransactionCreateReq,
  ITransactionCreateRes,
  ITransactionDeleteReq,
  ITransactionSearchReq,
  ITransactionSearchRes,
} from '@dtos/meow';
import { ResourceStatus, createStatus, dedupeRequest, getMapStatus, markStatusError, markStatusSuccess, setStatus } from './store-resource';

const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 15;

export class TransactionStore {
  transactions: ITransactionSearchRes['transactions'] | undefined = undefined;
  transactionsStatus: ResourceStatus = createStatus();
  transactionPage = DEFAULT_PAGE;
  transactionHasMore = true;
  transactionMutating = false;
  monthAnalysesByKey = new Map<string, ITransactionAnalyzeRes>();
  monthAnalyzeStatuses = new Map<string, ResourceStatus>();

  private inflight = new Map<string, Promise<unknown>>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  loadTransactions(options: { force?: boolean } = {}) {
    if (this.transactions && !options.force) {
      return Promise.resolve({ transactions: this.transactions });
    }
    return this.fetchTransactions(DEFAULT_PAGE);
  }

  refreshTransactions() {
    runInAction(() => {
      this.transactionPage = DEFAULT_PAGE;
      this.transactionHasMore = true;
    });
    return this.fetchTransactions(DEFAULT_PAGE);
  }

  loadMoreTransactions() {
    if (!this.transactionHasMore || this.transactionsStatus.loading || this.transactionsStatus.refreshing) {
      return Promise.resolve({ transactions: this.transactions ?? [] });
    }
    return this.fetchTransactions(this.transactionPage + 1);
  }

  getMonthAnalyze(year: number, month: number, includeCouponDiscount: boolean) {
    return this.monthAnalysesByKey.get(monthAnalyzeKey(year, month, includeCouponDiscount)) ?? null;
  }

  getMonthAnalyzeStatus(year: number, month: number, includeCouponDiscount: boolean) {
    return getMapStatus(this.monthAnalyzeStatuses, monthAnalyzeKey(year, month, includeCouponDiscount));
  }

  loadMonthAnalyze(params: { year: number; month: number; includeCouponDiscount?: boolean }, options: { force?: boolean } = {}) {
    const includeCouponDiscount = Boolean(params.includeCouponDiscount);
    const key = monthAnalyzeKey(params.year, params.month, includeCouponDiscount);
    const existing = this.monthAnalysesByKey.get(key);
    if (existing && !options.force) {
      return Promise.resolve(existing);
    }
    return this.fetchMonthAnalyze(params.year, params.month, includeCouponDiscount);
  }

  async createTransaction(payload: ITransactionCreateReq) {
    this.transactionMutating = true;
    try {
      const res = await post<ITransactionCreateReq, ITransactionCreateRes>('/api/transaction/create', payload);
      await this.refreshTransactions();
      return res;
    } finally {
      runInAction(() => {
        this.transactionMutating = false;
      });
    }
  }

  async deleteTransactions(payload: ITransactionDeleteReq) {
    this.transactionMutating = true;
    try {
      const res = await post<ITransactionDeleteReq, { count: number }>('/api/transaction/delete', payload);
      await this.refreshTransactions();
      return res;
    } finally {
      runInAction(() => {
        this.transactionMutating = false;
      });
    }
  }

  private fetchTransactions(page: number) {
    const key = `transactions:${page}:${DEFAULT_PAGE_SIZE}`;
    setStatus(this.transactionsStatus, this.transactions ? 'refreshing' : 'loading', true);
    return dedupeRequest(this.inflight, key, async () => {
      try {
        const res = await post<ITransactionSearchReq, ITransactionSearchRes>('/api/transaction/search', {
          page,
          pageSize: DEFAULT_PAGE_SIZE,
        });
        runInAction(() => {
          this.transactions = !this.transactions || page === DEFAULT_PAGE
            ? res.transactions
            : [...this.transactions, ...res.transactions];
          this.transactionHasMore = res.transactions.length >= DEFAULT_PAGE_SIZE;
          if (res.transactions.length > 0 || page === DEFAULT_PAGE) {
            this.transactionPage = page;
          }
          markStatusSuccess(this.transactionsStatus);
        });
        return res;
      } catch (error) {
        runInAction(() => markStatusError(this.transactionsStatus, error));
        throw error;
      }
    });
  }

  private fetchMonthAnalyze(year: number, month: number, includeCouponDiscount: boolean) {
    const key = monthAnalyzeKey(year, month, includeCouponDiscount);
    const status = getMapStatus(this.monthAnalyzeStatuses, key);
    setStatus(status, this.monthAnalysesByKey.has(key) ? 'refreshing' : 'loading', true);
    return dedupeRequest(this.inflight, `transaction-analyze:${key}`, async () => {
      try {
        const res = await post<ITransactionAnalyzeReq, ITransactionAnalyzeRes>('/api/transaction/analyze', {
          year,
          month,
          granularity: 'month',
          includeCouponDiscount,
        });
        runInAction(() => {
          this.monthAnalysesByKey.set(key, res);
          markStatusSuccess(status);
        });
        return res;
      } catch (error) {
        const empty = createEmptyMonthAnalyze();
        runInAction(() => {
          this.monthAnalysesByKey.set(key, empty);
          markStatusError(status, error);
        });
        return empty;
      }
    });
  }
}

const monthAnalyzeKey = (year: number, month: number, includeCouponDiscount: boolean) =>
  `${year}:${month}:${includeCouponDiscount ? 'net' : 'gross'}`;

const createEmptyMonthAnalyze = (): ITransactionAnalyzeRes => ({
  transactions: [],
  total: 0,
  grossTotal: 0,
  netTotal: 0,
  couponDiscountTotal: 0,
  couponUsages: [],
});