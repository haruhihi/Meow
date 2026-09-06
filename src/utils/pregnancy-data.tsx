import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  IPregnancyCautionDeleteReq,
  IPregnancyCautionDeleteRes,
  IPregnancyCautionSaveReq,
  IPregnancyCautionSaveRes,
  IPregnancyOverviewRes,
  IPregnancyProfileUpdateReq,
  IPregnancyProfileUpdateRes,
} from '@dtos/meow';
import { post } from '@libs/fetch';

export const usePregnancyOverview = () => {
  const [data, setData] = useState<IPregnancyOverviewRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  const reQuery = useCallback(async () => {
    if (hasDataRef.current) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await post<null, IPregnancyOverviewRes>('/api/pregnancy/overview', null);
      setData(response);
      hasDataRef.current = true;
      return response;
    } catch (requestError) {
      setError((requestError as { result?: string })?.result ?? '日历数据加载失败');
      throw requestError;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reQuery().catch(() => undefined);
  }, [reQuery]);

  const updateProfile = async (params: IPregnancyProfileUpdateReq) => {
    const response = await post<IPregnancyProfileUpdateReq, IPregnancyProfileUpdateRes>(
      '/api/pregnancy/profile/update',
      params
    );
    await reQuery();
    return response.profile;
  };

  const saveCaution = async (params: IPregnancyCautionSaveReq) => {
    const response = await post<IPregnancyCautionSaveReq, IPregnancyCautionSaveRes>(
      '/api/pregnancy/caution/save',
      params
    );
    await reQuery();
    return response.caution;
  };

  const deleteCaution = async (params: IPregnancyCautionDeleteReq) => {
    await post<IPregnancyCautionDeleteReq, IPregnancyCautionDeleteRes>(
      '/api/pregnancy/caution/delete',
      params
    );
    await reQuery();
  };

  return {
    data,
    loading,
    refreshing,
    error,
    reQuery,
    updateProfile,
    saveCaution,
    deleteCaution,
  };
};
