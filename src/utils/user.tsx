import { useEffect, useState } from 'react';
import { post } from '@libs/fetch';
import { IUserInfoRes } from '@dtos/meow';
import { useRefresh } from './tool';

const ACCOUNT_KEY = 'account';

const saveAccount = (res: IUserInfoRes) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCOUNT_KEY, res.user.account);
};

export const useUserInfo = () => {
  const [res, setRes] = useState<IUserInfoRes>();
  const { refreshSignal, refresh } = useRefresh();

  useEffect(() => {
    async function fetchUserInfo() {
      const res = await post<null, IUserInfoRes>('/api/user/info', null);
      saveAccount(res);
      setRes(res);
    }
    fetchUserInfo();
  }, [refreshSignal]);

  return {
    ...res,
    reQuery: () => {
      setRes(undefined);
      refresh();
    },
  };
};
