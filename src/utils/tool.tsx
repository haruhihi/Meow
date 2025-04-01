import { Toast, ToastShowProps } from 'antd-mobile';
import { isObject } from 'lodash-es';
import { useState } from 'react';

export const useRefresh = () => {
  const [timeStamp, setTimeStamp] = useState<number>(Date.now());
  return { refreshSignal: timeStamp, refresh: () => setTimeStamp(Date.now()) };
};

export const handleError = (err: unknown, props?: ToastShowProps) => {
  let msg = 'unknown error';
  if (err instanceof Error) {
    msg = err.message;
  } else if (typeof err === 'string') {
    msg = err;
  } else if (isObject(err) && err.hasOwnProperty('result')) {
    msg = (err as any)?.result;
  }
  Toast.show({
    content: `error: ${msg}`,
    ...props,
  });
};

export const isUrlEnable = (key: string) => {
  // console.log('global.window', global.window);
  if (global.window === undefined) return false;
  return window.location.href.includes(`${key}=1`);
};
