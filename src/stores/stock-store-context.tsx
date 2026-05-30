'use client';

import { MeowStoreProvider, useMeowStores } from './meow-store-context';

export const StockStoreProvider = MeowStoreProvider;

export const useStockStore = () => {
  return useMeowStores().stockStore;
};
