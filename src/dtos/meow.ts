import { Category, Coupon, Transaction, User } from '@prisma/client';
import { Prisma } from '@prisma/client';

export type TransactionWithCoupon = Prisma.TransactionGetPayload<{
  include: {
    category: true;
    coupon: true;
  };
}>;

export interface ICategoryRes {
  categories: Prisma.CategoryGetPayload<{
    include: {
      parent: true;
      children: true;
    };
  }>[];
}

export interface ICategoryCreateReq {
  parentId: Category['parentId'];
  name: Category['name'];
}

export interface ICategoryCreateRes {
  category: Category;
}

export interface ITransactionCreateReq {
  categoryId: Transaction['categoryId'];
  amount: Transaction['amount'];
  description?: Transaction['description'];
  date: number;
  couponId?: Transaction['couponId'];
  couponDiscount?: Transaction['couponDiscount'];
}

export interface ITransactionCreateRes {
  transaction: Transaction;
}

export interface ITransactionSearchRes {
  transactions: TransactionWithCoupon[];
}

export interface ITransactionSearchReq {
  page: number;
  pageSize: number;
}

export interface ITransactionAnalyzeReq {
  categoryId?: Transaction['categoryId'];
  year: number;   // 年份
  month: number;  // 月份 (1-12)
  granularity?: 'month' | 'year';
  includeCouponDiscount?: boolean;
}

export interface ICouponUsageSummary {
  couponId: Coupon['id'] | null;
  name: string;
  discount: number;
  count: number;
}

export interface ITransactionAnalyzeRes {
  transactions: TransactionWithCoupon[];
  total: number;
  grossTotal: number;
  netTotal: number;
  couponDiscountTotal: number;
  couponUsages: ICouponUsageSummary[];
}

export interface ITransactionDeleteReq {
  ids: Transaction['id'][];
}

export interface ISignReq {
  account: string;
  password: string;
  nickname?: string;
}

export interface IUserInfoRes {
  user: User;
}

export interface ICategoryMergeReq {
  fromId: number;
  toId: number;
}

export interface ICategoryMergeRes {
  movedChildren: number;
  movedTransactions: number;
}

export interface ICategoryDeleteReq {
  id: number;
}

export interface ICategoryDeleteRes {
  id: number;
}

export interface ICouponSearchReq {
  year?: number;
  month?: number;
  includeAdjacent?: boolean;
  includeEmpty?: boolean;
  keyword?: string;
}

export interface ICouponSearchRes {
  coupons: Coupon[];
}

export interface ICouponCreateReq {
  name: Coupon['name'];
  type?: Coupon['type'];
  amount: Coupon['amount'];
  validYear: Coupon['validYear'];
  validMonth: Coupon['validMonth'];
}

export interface ICouponCreateRes {
  coupon: Coupon;
}

export interface ICouponUpdateReq extends Partial<ICouponCreateReq> {
  id: Coupon['id'];
}

export interface ICouponUpdateRes {
  coupon: Coupon;
}

export interface ICouponDeleteReq {
  id: Coupon['id'];
}

export interface ICouponSeedRes {
  created: number;
  skipped: number;
}
