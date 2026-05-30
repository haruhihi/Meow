'use client';

import React, { createContext, useContext, useRef } from 'react';
import { StockStore } from './stock-store';

const StockStoreContext = createContext<StockStore | null>(null);

export const StockStoreProvider = ({ children }: { children: React.ReactNode }) => {
  const storeRef = useRef<StockStore>();
  if (!storeRef.current) {
    storeRef.current = new StockStore();
  }

  return (
    <StockStoreContext.Provider value={storeRef.current}>
      {children}
    </StockStoreContext.Provider>
  );
};

export const useStockStore = () => {
  const store = useContext(StockStoreContext);
  if (!store) {
    throw new Error('useStockStore must be used within StockStoreProvider');
  }
  return store;
};
