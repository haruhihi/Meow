'use client';

import React, { createContext, useContext, useRef } from 'react';
import { CouponStore } from './coupon-store';
import { StockStore } from './stock-store';
import { TransactionStore } from './transaction-store';

export type MeowStores = {
  couponStore: CouponStore;
  stockStore: StockStore;
  transactionStore: TransactionStore;
};

const createMeowStores = (): MeowStores => ({
  couponStore: new CouponStore(),
  stockStore: new StockStore(),
  transactionStore: new TransactionStore(),
});

const MeowStoreContext = createContext<MeowStores | null>(null);

export const MeowStoreProvider = ({ children }: { children: React.ReactNode }) => {
  const storesRef = useRef<MeowStores>();
  if (!storesRef.current) {
    storesRef.current = createMeowStores();
  }

  return (
    <MeowStoreContext.Provider value={storesRef.current}>
      {children}
    </MeowStoreContext.Provider>
  );
};

export const useMeowStores = () => {
  const stores = useContext(MeowStoreContext);
  if (!stores) {
    throw new Error('useMeowStores must be used within MeowStoreProvider');
  }
  return stores;
};