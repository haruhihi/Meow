import { Category, Transaction, Trek, User, Budget } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface ICategoryRes {
  categories: Prisma.CategoryGetPayload<{
    include: {
      parent: true;
      children: true;
    };
  }>[];
}

export interface ITrekSearchRes {
  treks: Trek[];
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
}

export interface ITransactionCreateRes {
  transaction: Transaction;
}

export interface ITransactionSearchRes {
  transactions: Prisma.TransactionGetPayload<{
    include: {
      category: true;
    };
  }>[];
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
}

export interface ITransactionAnalyzeRes {
  transactions: Prisma.TransactionGetPayload<{
    include: {
      category: true;
    };
  }>[];
  total: number;
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

export interface ITrekCreateReq {
  date: number;
  count: Trek['count'];
  type: string;
}

export interface ITrekCreateRes {
  trek: Trek;
}

export interface ITrekDeleteRes {
  treks: Trek[];
}

export interface ICategoryMergeReq {
  fromId: number;
  toId: number;
}

export interface ICategoryMergeRes {
  movedChildren: number;
  movedTransactions: number;
  movedBudgets: number;
}

export interface ICategoryDeleteReq {
  id: number;
}

export interface ICategoryDeleteRes {
  id: number;
}

export interface IBudgetSearchReq {
  year: number;
  month: number;
}

export interface IBudgetSearchRes {
  budgets: Prisma.BudgetGetPayload<{
    include: { category: true };
  }>[];
}

export interface IBudgetUpsertReq {
  year: number;
  month: number;
  amount: number | null;
}

export interface IBudgetUpsertRes {
  budget: Budget | null;
}
