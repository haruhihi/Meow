import { useEffect, useState } from 'react';
import { post } from '@libs/fetch';
import { IStockQuoteRefreshReq, IStockQuoteRefreshRes, IStockSearchReq, IStockSearchRes } from '@dtos/meow';

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
