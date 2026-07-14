import { ActivityType, Category, Coupon, StockAccount, StockAiReport, StockDividendEvent, StockDividendMarking, StockHolding, StockQuote, StockRemark, StockSnapshot, TimeActivityGroup, TimeActivityGroupTargetDirection, TimeEntry, Transaction, User } from '@prisma/client';
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

export interface ITransactionUpdateReq extends ITransactionCreateReq {
  id: Transaction['id'];
}

export interface ITransactionUpdateRes {
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

export type TimeEntryWithActivityType = Prisma.TimeEntryGetPayload<{
  include: {
    activityType: true;
    activities: {
      include: {
        activityType: true;
      };
    };
  };
}>;

export interface IActivityTypeListRes {
  activityTypes: ActivityType[];
}

export interface IActivityTypeCreateReq {
  name: ActivityType['name'];
}

export interface IActivityTypeCreateRes {
  activityType: ActivityType;
}

export type TimeActivityGroupWithActivityTypes = Prisma.TimeActivityGroupGetPayload<{
  include: {
    activityTypes: true;
  };
}>;

export interface ITimeActivityGroupListRes {
  groups: TimeActivityGroupWithActivityTypes[];
}

export interface ITimeActivityGroupDraft {
  id?: TimeActivityGroup['id'];
  name: TimeActivityGroup['name'];
  targetMinutes: TimeActivityGroup['targetMinutes'];
  targetDirection: TimeActivityGroupTargetDirection;
  activityTypeIds: ActivityType['id'][];
}

export interface ITimeActivityGroupSaveReq {
  groups: ITimeActivityGroupDraft[];
}

export interface ITimeActivityGroupSaveRes {
  groups: TimeActivityGroupWithActivityTypes[];
}

export interface ITimeEntryCreateReq {
  activityTypeId?: TimeEntry['activityTypeId'];
  activityTypeIds?: ActivityType['id'][];
  startedAt: number;
  endedAt: number;
  note?: TimeEntry['note'];
}

export interface ITimeEntryCreateRes {
  timeEntry: TimeEntry;
}

export interface ITimeEntryUpdateReq extends Partial<ITimeEntryCreateReq> {
  id: TimeEntry['id'];
}

export interface ITimeEntryUpdateRes {
  timeEntry: TimeEntry;
}

export interface ITimeEntrySearchReq {
  page: number;
  pageSize: number;
}

export interface ITimeEntrySearchRes {
  timeEntries: TimeEntryWithActivityType[];
}

export interface ITimeEntryDeleteReq {
  ids: TimeEntry['id'][];
}

export interface ITimeEntryAnalyzeReq {
  startedAt: number;
  endedAt: number;
  timezoneOffsetMinutes?: number;
  includeHourly?: boolean;
}

export interface ITimeActivityGroupSummary {
  groupId: TimeActivityGroup['id'];
  name: TimeActivityGroup['name'];
  color: TimeActivityGroup['color'];
  targetMinutes: TimeActivityGroup['targetMinutes'];
  targetDirection: TimeActivityGroupTargetDirection;
  minutes: number;
  recordedDays: number;
  targetMetDays: number;
}

// The life-analysis report generator uses these activity-level snapshots
// independently from the Time dashboard's group-based analytics.
export interface ITimeActivitySummary {
  activityTypeId: ActivityType['id'];
  name: ActivityType['name'];
  color: ActivityType['color'];
  icon: ActivityType['icon'];
  minutes: number;
  count: number;
}

export interface ITimeDailySummary {
  date: string;
  minutes: number;
  byActivity: Record<string, number>;
  firstStartedAt?: string;
  lastEndedAt?: string;
}

export interface ITimeGroupDailySummary {
  date: string;
  hasRecords: boolean;
  byGroup: Record<string, number>;
}

export interface ITimeGroupHourlySummary {
  hour: number;
  byGroup: Record<string, number>;
}

export interface ITimeEntryAnalyzeRes {
  groupSummaries: ITimeActivityGroupSummary[];
  recordedDays: number;
  dailySummaries: ITimeGroupDailySummary[];
  hourlySummaries: ITimeGroupHourlySummary[];
}

export interface UserLifeAnalysisProfileItem {
  id: number;
  userId: number;
  profile: Prisma.JsonValue;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface IUserLifeAnalysisProfileUpsertReq {
  profile: Prisma.JsonValue;
  prompt: string;
}

export interface IUserLifeAnalysisProfileUpsertRes {
  profile: UserLifeAnalysisProfileItem;
}

export interface UserLifeAnalysisReportListItem {
  id: number;
  userId: number;
  reportKey: string;
  title: string;
  summary: string;
  prompt: string;
  inputSnapshot: Prisma.JsonValue;
  content: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  updatedAt: string;
}

export interface IUserLifeAnalysisProfileRes {
  profile: UserLifeAnalysisProfileItem;
}

export interface IUserLifeAnalysisReportListReq {
  ensureLatest?: boolean;
  timezoneOffsetMinutes?: number;
}

export interface IUserLifeAnalysisReportListRes {
  reports: UserLifeAnalysisReportListItem[];
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

export type StockHoldingWithAccount = StockHolding & {
  account: StockAccount;
  quote: StockQuote;
  name: StockQuote['name'];
  currentPrice: StockQuote['currentPrice'];
};

export interface IStockAccountCreateReq {
  name: StockAccount['name'];
}

export interface IStockAccountCreateRes {
  account: StockAccount;
}

export interface IStockAccountUpdateReq {
  id: StockAccount['id'];
  name?: StockAccount['name'];
  sortOrder?: StockAccount['sortOrder'];
}

export interface IStockAccountUpdateRes {
  account: StockAccount;
}

export interface IStockAccountDeleteReq {
  id: StockAccount['id'];
}

export interface IStockHoldingCreateReq {
  accountId: StockHolding['accountId'];
  symbol: StockHolding['symbol'];
  name: StockQuote['name'];
  quantity: StockHolding['quantity'];
  currentPrice: StockQuote['currentPrice'];
}

export interface IStockHoldingCreateRes {
  holding: StockHolding;
}

export interface IStockHoldingUpdateReq extends Partial<IStockHoldingCreateReq> {
  id: StockHolding['id'];
}

export interface IStockHoldingUpdateRes {
  holding: StockHolding;
}

export interface IStockHoldingDeleteReq {
  id: StockHolding['id'];
}

export interface IStockPortfolioAccountSummary {
  accountId: StockAccount['id'];
  name: StockAccount['name'];
  marketValue: number;
  percent: number;
  holdingCount: number;
}

export interface IStockPeValuationTarget {
  percentile: number;
  pe: number | null;
  price: number | null;
  upside: number | null;
}

export interface IStockProfitHistoryPoint {
  reportDate: string;
  year: number;
  deductedNetProfit: number | null;
  yoy: number | null;
}

export interface IStockValuationHistoryPoint {
  date: string;
  pe: number | null;
  pb: number | null;
  dividendYield: number | null;
  pePercentile: number | null;
  pbPercentile: number | null;
}

export interface IStockValuationHistoryReq {
  symbol: string;
}

export interface IStockValuationHistoryRes {
  symbol: string;
  startDate: string | null;
  endDate: string | null;
  valuationHistory: IStockValuationHistoryPoint[];
}

export interface IStockPriceHistoryReq {
  symbol: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface IStockPriceHistoryPoint {
  date: string;
  close: number | null;
  qfqClose: number | null;
  indexClose: number | null;
}

export interface IStockPriceHistoryRes {
  symbol: string;
  indexSymbol: string;
  startDate: string | null;
  endDate: string | null;
  latestAdjFactor: number | null;
  points: IStockPriceHistoryPoint[];
}

export interface IStockPeValuationSummary {
  currentPe: number | null;
  currentPercentile: number | null;
  currentPbPercentile: number | null;
  sampleCount: number;
  pbSampleCount: number;
  startDate: string | null;
  endDate: string | null;
  targets: IStockPeValuationTarget[];
  profitHistory: IStockProfitHistoryPoint[];
  valuationHistory: IStockValuationHistoryPoint[];
}

export interface IStockPortfolioSymbolSummary {
  symbol: StockHolding['symbol'];
  name: StockQuote['name'];
  sector: string;
  currentPrice: number;
  quantity: number;
  marketValue: number;
  percent: number;
  holdingCount: number;
  accounts: StockAccount['name'][];
  totalShares?: number | null;
  deductedNetProfit?: number | null;
  deductedNetProfitTtm?: number | null;
  deductedNetProfitTtmWarning?: string | null;
  financialCacheStatus?: string | null;
  financialDataReportDate?: string | null;
  financialDataReportName?: string | null;
  valuationCacheStatus?: string | null;
  valuationDataReportDate?: string | null;
  valuationDataReportName?: string | null;
  valuationDataSnapshotDate?: string | null;
  netProfit?: number | null;
  netProfitTtm?: number | null;
  netProfitTtmWarning?: string | null;
  revenue?: number | null;
  revenueTtm?: number | null;
  netAsset?: number | null;
  totalAssets?: number | null;
  operatingCashFlow?: number | null;
  operatingCashFlowTtm?: number | null;
  capitalExpenditure?: number | null;
  capitalExpenditureTtm?: number | null;
  normalizedDividend?: number | null;
  reportDate?: string | null;
  deductedNetProfitCagr5?: number | null;
  deductedNetProfitCagrYears?: number | null;
  deductedPeg?: number | null;
  goodwill?: number | null;
  goodwillToNetAsset?: number | null;
  goodwillToTotalAssets?: number | null;
  deductedPe?: number | null;
  deductedPeTtm?: number | null;
  pb?: number | null;
  deductedRoe?: number | null;
  deductedRoeTtm?: number | null;
  normalizedDividendYield?: number | null;
  freeCashFlow?: number | null;
  freeCashFlowTtm?: number | null;
  fcfDividendCoverage?: number | null;
  operatingCashFlowToDeductedNetProfit?: number | null;
  peValuation?: IStockPeValuationSummary | null;
}

export interface IStockPortfolioSectorSummary {
  sector: string;
  marketValue: number;
  percent: number;
  symbolCount: number;
  symbols: IStockPortfolioSymbolSummary[];
}

export interface IStockSearchReq {
  keyword?: string;
  detailSymbol?: string;
}

export interface IStockSearchRes {
  accounts: StockAccount[];
  holdings: StockHoldingWithAccount[];
  cashAmount: number;
  totalMarketValue: number;
  totalAssetValue: number;
  cashPercent: number;
  accountSummaries: IStockPortfolioAccountSummary[];
  sectorSummaries: IStockPortfolioSectorSummary[];
  symbolSummaries: IStockPortfolioSymbolSummary[];
  hiddenSymbols: string[];
}

export interface IStockSymbolVisibilityUpdateReq {
  symbol: string;
  isHidden: boolean;
}

export interface IStockSymbolVisibilityUpdateRes {
  symbol: string;
  isHidden: boolean;
}

export interface IStockMagicFormulaSearchReq {
  sector?: string | null;
}

export interface IStockMagicFormulaMetric {
  key: 'deductedPe' | 'deductedRoe' | 'deductedRoa' | 'dividendYield' | 'deductedPeg' | 'deductedNetProfitCagr5';
  label: string;
  direction: 'asc' | 'desc';
  value: number | null;
  display: string;
}

export interface IStockMagicFormulaItem {
  symbol: string;
  name: string;
  sector: string;
  isHeld: boolean;
  currentPrice: number | null;
  marketValue: number;
  percent: number;
  metrics: IStockMagicFormulaMetric[];
  flags: string[];
  reportName?: string | null;
  reportDate?: string | null;
  deductedNetProfitCagr5?: number | null;
  deductedNetProfitCagrYears?: number | null;
  goodwillToNetAsset?: number | null;
  operatingCashFlowToDeductedNetProfit?: number | null;
  fcfDividendCoverage?: number | null;
}

export interface IStockMagicFormulaSearchRes {
  selectedSector: string;
  sectors: string[];
  items: IStockMagicFormulaItem[];
  updatedAt: string;
}

export interface IStockSnapshotSummary {
  totalMarketValue: number;
  totalAssetValue: number;
  cashAmount: number;
  expectedDividend: number;
  portfolioDividendYield: number;
  holdingCount: number;
  symbolCount: number;
}

export interface StockSnapshotListItem {
  id: StockSnapshot['id'];
  snapshotAt: string;
  snapshotMonth: StockSnapshot['snapshotMonth'];
  source: StockSnapshot['source'];
  summary: IStockSnapshotSummary;
  createdAt: string;
  updatedAt: string;
}

export interface StockSnapshotDetail extends StockSnapshotListItem {
  portfolio: IStockSearchRes;
}

export interface IStockSnapshotDetailReq {
  id: StockSnapshot['id'];
}

export interface IStockSnapshotDetailRes {
  snapshot: StockSnapshotDetail;
}

export interface IStockSnapshotCreateReq {
  duplicatePolicy?: 'abort' | 'append' | 'replace';
  source?: StockSnapshot['source'];
  snapshotAt?: string;
}

export interface IStockSnapshotCreateRes {
  status: 'created' | 'exists' | 'aborted';
  snapshot?: StockSnapshotListItem;
  existingSnapshotCount?: number;
  latestSnapshot?: StockSnapshotListItem | null;
}

export interface IStockSnapshotListReq {
  limit?: number;
}

export interface IStockSnapshotListRes {
  snapshots: StockSnapshotListItem[];
}

export interface IStockCashUpdateReq {
  amount: number;
}

export interface IStockCashUpdateRes {
  amount: number;
}

export interface IStockRebalanceHoldingUpdate {
  id: StockHolding['id'];
  quantity: StockHolding['quantity'];
}

export interface IStockRebalanceHoldingDelete {
  id: StockHolding['id'];
}

export interface IStockRebalanceHoldingCreate {
  accountId: StockHolding['accountId'];
  symbol: StockHolding['symbol'];
  name: StockQuote['name'];
  quantity: StockHolding['quantity'];
  currentPrice: StockQuote['currentPrice'];
}

export interface IStockRebalanceSaveReq {
  cashAmount: number;
  holdingUpdates: IStockRebalanceHoldingUpdate[];
  holdingDeletes: IStockRebalanceHoldingDelete[];
  holdingCreates: IStockRebalanceHoldingCreate[];
}

export interface IStockRebalanceSaveRes {
  cashAmount: number;
  updated: number;
  deleted: number;
  created: number;
}

export interface IStockMetricOverrideUpdateReq {
  symbol: StockQuote['symbol'];
  normalizedDividend?: number | null;
  note?: string | null;
}

export interface IStockMetricOverrideUpdateRes {
  symbol: StockQuote['symbol'];
  normalizedDividend: number | null;
  note: string | null;
}

export type StockRemarkListItem = Omit<StockRemark, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

export interface IStockRemarkListReq {
  symbol: StockQuote['symbol'];
}

export interface IStockRemarkListRes {
  symbol: StockQuote['symbol'];
  name: StockQuote['name'];
  remarks: StockRemarkListItem[];
}

export interface IStockRemarkCreateReq {
  symbol: StockQuote['symbol'];
  remarkDate: StockRemark['remarkDate'];
  content: StockRemark['content'];
}

export interface IStockRemarkCreateRes {
  remark: StockRemarkListItem;
}

export interface IStockRemarkUpdateReq {
  id: StockRemark['id'];
  remarkDate?: StockRemark['remarkDate'];
  content?: StockRemark['content'];
}

export interface IStockRemarkUpdateRes {
  remark: StockRemarkListItem;
}

export interface IStockRemarkDeleteReq {
  id: StockRemark['id'];
}

export interface IStockRemarkDeleteRes {
  id: StockRemark['id'];
}

export type StockDividendEventWithMarking = StockDividendEvent & {
  marking: Pick<StockDividendMarking, 'countTowardNormalizedDividend' | 'note'> | null;
};

export interface IStockDividendListReq {
  symbol?: StockQuote['symbol'];
}

export interface IStockDividendListRes {
  events: StockDividendEventWithMarking[];
}

export interface IStockDividendMarkingUpdateReq {
  eventId: StockDividendEvent['id'];
  countTowardNormalizedDividend: boolean;
  note?: string | null;
}

export interface IStockDividendMarkingUpdateRes {
  eventId: StockDividendEvent['id'];
  countTowardNormalizedDividend: boolean;
  note: string | null;
}

export interface IStockQuoteRefreshReq {
  symbols?: StockQuote['symbol'][];
}

export interface IStockQuoteRefreshItem {
  symbol: StockQuote['symbol'];
  name?: StockQuote['name'];
  currentPrice: StockQuote['currentPrice'];
  source: 'eastmoney' | 'sina';
}

export interface IStockQuoteRefreshRes {
  updated: number;
  failedSymbols: StockQuote['symbol'][];
  quotes: IStockQuoteRefreshItem[];
  source: 'eastmoney' | 'sina' | 'mixed';
  fetchedAt: string;
}

export interface IStockAiReportSourceLink {
  title: string;
  url: string;
}

export type StockAiReportListItem = Omit<StockAiReport, 'sourceLinks' | 'reportDate' | 'createdAt' | 'updatedAt'> & {
  sourceLinks: IStockAiReportSourceLink[];
  reportDate: string;
  createdAt: string;
  updatedAt: string;
};

export interface IStockAiReportListReq {
  symbol?: StockQuote['symbol'];
}

export interface IStockAiReportListRes {
  reports: StockAiReportListItem[];
}

export interface IStockAiReportCreateReq {
  symbol: StockQuote['symbol'];
  title: StockAiReport['title'];
  summary: StockAiReport['summary'];
  content: StockAiReport['content'];
  slug?: StockAiReport['slug'];
  sourceLinks?: IStockAiReportSourceLink[];
  reportDate?: string;
}

export interface IStockAiReportCreateRes {
  report: StockAiReportListItem;
}

export type StockFinancialStatementName = 'income' | 'balance' | 'cash_flow';

export interface IStockFinancialStatementListReq {
  symbol: StockQuote['symbol'];
  limit?: number;
}

export interface StockFinancialStatementPeriodItem {
  reportDate: string;
  reportName: string;
}

export interface StockFinancialStatementMappedValue {
  value: number | string | null;
  yoy: number | null;
}

export interface StockFinancialStatementMappedRow {
  label: string;
  field: string | null;
  note?: string;
  values: Record<string, StockFinancialStatementMappedValue>;
}

export interface StockFinancialStatementMappedSection {
  statement: StockFinancialStatementName;
  title: string;
  periods: StockFinancialStatementPeriodItem[];
  rows: StockFinancialStatementMappedRow[];
}

export interface IStockFinancialStatementListRes {
  symbol: StockQuote['symbol'];
  name: StockQuote['name'];
  sections: StockFinancialStatementMappedSection[];
}
