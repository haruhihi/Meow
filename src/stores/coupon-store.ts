import { makeAutoObservable, runInAction } from 'mobx';
import { post } from '@libs/fetch';
import { ICouponSearchReq, ICouponSearchRes } from '@dtos/meow';
import { ResourceStatus, dedupeRequest, getMapStatus, markStatusError, markStatusSuccess, setStatus } from './store-resource';

export class CouponStore {
  paymentCouponsByMonth = new Map<string, ICouponSearchRes['coupons']>();
  paymentCouponStatuses = new Map<string, ResourceStatus>();

  private inflight = new Map<string, Promise<unknown>>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  getPaymentCoupons(year: number, month: number) {
    return this.paymentCouponsByMonth.get(monthKey(year, month)) ?? [];
  }

  getPaymentCouponStatus(year: number, month: number) {
    return getMapStatus(this.paymentCouponStatuses, monthKey(year, month));
  }

  loadPaymentCoupons(year: number, month: number, options: { force?: boolean } = {}) {
    const key = monthKey(year, month);
    const existing = this.paymentCouponsByMonth.get(key);
    if (existing && !options.force) {
      return Promise.resolve(existing);
    }
    return this.fetchPaymentCoupons(year, month);
  }

  private fetchPaymentCoupons(year: number, month: number) {
    const key = monthKey(year, month);
    const status = getMapStatus(this.paymentCouponStatuses, key);
    setStatus(status, this.paymentCouponsByMonth.has(key) ? 'refreshing' : 'loading', true);
    return dedupeRequest(this.inflight, `payment-coupons:${key}`, async () => {
      try {
        const res = await post<ICouponSearchReq, ICouponSearchRes>('/api/coupon/search', {
          year,
          month,
          includeAdjacent: true,
        });
        const coupons = sortPaymentCoupons(res.coupons, year, month);
        runInAction(() => {
          this.paymentCouponsByMonth.set(key, coupons);
          markStatusSuccess(status);
        });
        return coupons;
      } catch (error) {
        runInAction(() => {
          this.paymentCouponsByMonth.set(key, []);
          markStatusError(status, error);
        });
        return [];
      }
    });
  }
}

const monthKey = (year: number, month: number) => `${year}:${month}`;

const sortPaymentCoupons = (coupons: ICouponSearchRes['coupons'], year: number, month: number) => {
  const currentKey = year * 12 + month;
  const rank = (diff: number) => (diff === 0 ? 0 : diff === -1 ? 1 : diff === 1 ? 2 : 3 + Math.abs(diff));
  return coupons.slice().sort((left, right) => {
    const leftRank = rank(left.validYear * 12 + left.validMonth - currentKey);
    const rightRank = rank(right.validYear * 12 + right.validMonth - currentKey);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.name.localeCompare(right.name, 'zh-CN');
  });
};