import { useEffect, useState } from 'react';
import { post } from '@libs/fetch';
import {
  ITransactionSearchRes,
  ITransactionSearchReq,
  ITransactionAnalyzeReq,
  ITransactionAnalyzeRes,
  IBudgetSearchReq,
  IBudgetSearchRes,
  IBudgetUpsertReq,
  IBudgetUpsertRes,
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
export const useMonthAnalyze = (month: dayjs.Dayjs, refreshKey: number = 0) => {
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
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData({ transactions: [], total: 0 });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, m, refreshKey]);

  return { data, loading };
};

export const useMonthBudget = (month: dayjs.Dayjs, refreshKey: number = 0) => {
  const [budget, setBudget] = useState<IBudgetSearchRes['budgets'][number] | null>(null);
  const year = month.year();
  const m = month.month() + 1;

  useEffect(() => {
    let cancelled = false;
    post<IBudgetSearchReq, IBudgetSearchRes>('/api/budget/search', { year, month: m })
      .then((res) => {
        if (cancelled) return;
        // Prefer the overall budget (categoryId == null) if one exists.
        const overall = res.budgets.find((b) => b.categoryId == null) ?? null;
        setBudget(overall);
      })
      .catch(() => {
        if (!cancelled) setBudget(null);
      });
    return () => {
      cancelled = true;
    };
  }, [year, m, refreshKey]);

  return budget;
};

export const upsertMonthBudget = (year: number, month: number, amount: number | null) =>
  post<IBudgetUpsertReq, IBudgetUpsertRes>('/api/budget/upsert', { year, month, amount });

