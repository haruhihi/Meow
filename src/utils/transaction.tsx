import { useEffect } from 'react';
import { post } from '@libs/fetch';
import { useMeowStores } from '@stores/meow-store-context';
import {
  ICouponSearchReq,
  ICouponSearchRes,
  ITransactionCreateReq,
  ITransactionDeleteReq,
} from '@dtos/meow';
import dayjs from 'dayjs';

export const useTransactions = () => {
  const { transactionStore } = useMeowStores();

  useEffect(() => {
    void transactionStore.loadTransactions({ force: false });
  }, [transactionStore]);

  return {
    transactions: transactionStore.transactions,
    loading: transactionStore.transactionsStatus.loading,
    refreshing: transactionStore.transactionsStatus.refreshing,
    loadMore: transactionStore.loadMoreTransactions,
    hasMore: transactionStore.transactionHasMore,
    reQuery: transactionStore.refreshTransactions,
    createTransaction: (params: ITransactionCreateReq) => transactionStore.createTransaction(params),
    deleteTransactions: (params: ITransactionDeleteReq) => transactionStore.deleteTransactions(params),
    mutating: transactionStore.transactionMutating,
  };
};

// Fetch analyze data (full month dump). Bumps on refreshKey change.
export const useMonthAnalyze = (month: dayjs.Dayjs, refreshKey: number = 0, includeCouponDiscount = false) => {
  const { transactionStore } = useMeowStores();
  const year = month.year();
  const m = month.month() + 1;

  useEffect(() => {
    void transactionStore.loadMonthAnalyze({
      year,
      month: m,
      includeCouponDiscount,
    }, { force: refreshKey > 0 });
  }, [year, m, refreshKey, includeCouponDiscount, transactionStore]);

  const status = transactionStore.getMonthAnalyzeStatus(year, m, includeCouponDiscount);

  return {
    data: transactionStore.getMonthAnalyze(year, m, includeCouponDiscount),
    loading: status.loading,
    refreshing: status.refreshing,
    reQuery: () => transactionStore.loadMonthAnalyze({ year, month: m, includeCouponDiscount }, { force: true }),
  };
};

export const usePaymentCoupons = (month: dayjs.Dayjs, refreshKey: number = 0) => {
  const { couponStore } = useMeowStores();
  const year = month.year();
  const m = month.month() + 1;

  useEffect(() => {
    void couponStore.loadPaymentCoupons(year, m, { force: refreshKey > 0 });
  }, [year, m, refreshKey, couponStore]);

  return couponStore.getPaymentCoupons(year, m);
};

export const searchCoupons = (params: ICouponSearchReq) =>
  post<ICouponSearchReq, ICouponSearchRes>('/api/coupon/search', params);

