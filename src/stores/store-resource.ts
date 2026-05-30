import { runInAction } from 'mobx';

export type ResourceStatus = {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  updatedAt: number | null;
};

export const createStatus = (): ResourceStatus => ({
  loading: false,
  refreshing: false,
  error: null,
  updatedAt: null,
});

export const getErrorMessage = (error: unknown) =>
  (error as any)?.result ?? (error instanceof Error ? error.message : String(error));

export const getMapStatus = <TKey>(map: Map<TKey, ResourceStatus>, key: TKey) => {
  let status = map.get(key);
  if (!status) {
    status = createStatus();
    map.set(key, status);
  }
  return status;
};

export const setStatus = (status: ResourceStatus, key: 'loading' | 'refreshing', value: boolean) => {
  status[key] = value;
  status.error = null;
};

export const markStatusSuccess = (status: ResourceStatus) => {
  status.loading = false;
  status.refreshing = false;
  status.error = null;
  status.updatedAt = Date.now();
};

export const markStatusError = (status: ResourceStatus, error: unknown) => {
  status.loading = false;
  status.refreshing = false;
  status.error = getErrorMessage(error);
};

export const dedupeRequest = <T>(inflight: Map<string, Promise<unknown>>, key: string, fetcher: () => Promise<T>) => {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = fetcher().finally(() => {
    runInAction(() => inflight.delete(key));
  });
  inflight.set(key, promise);
  return promise;
};