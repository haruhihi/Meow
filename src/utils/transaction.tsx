import { useEffect, useState } from 'react';
import { post } from '@libs/fetch';
import {
  ITransactionSearchRes,
  ITransactionSearchReq,
  ITransactionAnalyzeReq,
  ITransactionAnalyzeRes,
  ICouponSearchReq,
  ICouponSearchRes,
} from '@dtos/meow';
import dayjs from 'dayjs';

const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 15;

export const useTransactions = () => {
  const [page, setPage] = useState<number>(DEFAULT_PAGE);
  const [transactions, setTransactions] = useState<ITransactionSearchRes['transactions']>();
  const [hasMore, setHasMore] = useState<boolean>(true);

  const fetchTransactions = async (page: number) => {
    const res = await post<ITransactionSearchReq, ITransactionSearchRes>('/api/transaction/search', {
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    if (!transactions || page === DEFAULT_PAGE) {
      setTransactions(res.transactions);
    } else {
      setTransactions([...transactions, ...res.transactions]);
    }

    if (res.transactions.length < DEFAULT_PAGE_SIZE) {
      setHasMore(false);
    }

    if (res.transactions.length > 0) {
      setPage(page);
    }
  };

  useEffect(() => {
    fetchTransactions(DEFAULT_PAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    transactions,
    loadMore: async () => {
      return fetchTransactions(page + 1);
    },
    hasMore,
    reQuery: async () => {
      setTransactions(undefined);
      setPage(DEFAULT_PAGE);
      setHasMore(true);
      fetchTransactions(DEFAULT_PAGE);
    },
  };
};

// Fetch analyze data (full month dump). Bumps on refreshKey change.
export const useMonthAnalyze = (month: dayjs.Dayjs, refreshKey: number = 0, includeCouponDiscount = false) => {
  const [data, setData] = useState<ITransactionAnalyzeRes | null>(null);
  const [loading, setLoading] = useState(false);
  const year = month.year();
  const m = month.month() + 1;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    post<ITransactionAnalyzeReq, ITransactionAnalyzeRes>('/api/transaction/analyze', {
      year,
      month: m,
      granularity: 'month',
      includeCouponDiscount,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            transactions: [],
            total: 0,
            grossTotal: 0,
            netTotal: 0,
            couponDiscountTotal: 0,
            couponUsages: [],
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, m, refreshKey, includeCouponDiscount]);

  return { data, loading };
};

export const usePaymentCoupons = (month: dayjs.Dayjs, refreshKey: number = 0) => {
  const [coupons, setCoupons] = useState<ICouponSearchRes['coupons']>([]);
  const year = month.year();
  const m = month.month() + 1;

  useEffect(() => {
    let cancelled = false;
    post<ICouponSearchReq, ICouponSearchRes>('/api/coupon/search', {
      year,
      month: m,
      includeAdjacent: true,
    })
      .then((res) => {
        if (cancelled) return;
        const currentKey = year * 12 + m;
        setCoupons(
          res.coupons
            .slice()
            .sort((left, right) => {
              const rank = (diff: number) => (diff === 0 ? 0 : diff === -1 ? 1 : diff === 1 ? 2 : 3 + Math.abs(diff));
              const leftRank = rank(left.validYear * 12 + left.validMonth - currentKey);
              const rightRank = rank(right.validYear * 12 + right.validMonth - currentKey);
              if (leftRank !== rightRank) return leftRank - rightRank;
              return left.name.localeCompare(right.name, 'zh-CN');
            })
        );
      })
      .catch(() => {
        if (!cancelled) setCoupons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [year, m, refreshKey]);

  return coupons;
};

export const searchCoupons = (params: ICouponSearchReq) =>
  post<ICouponSearchReq, ICouponSearchRes>('/api/coupon/search', params);

