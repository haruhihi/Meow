import { useMemo, type CSSProperties } from 'react';
import type { StockAccount } from '@prisma/client';
import type { IStockPortfolioSymbolSummary } from '@dtos/meow';
import { formatMoney } from '@styles/theme';
import { formatStockQuantity, roundStockValue } from '@utils/stock-calculations';
import { REBALANCE_QUANTITY_STEP, StockRebalanceHolding } from '@utils/stock-rebalance';
import styles from './stocks.module.scss';

const formatSignedMoney = (value: number) => `${value >= 0 ? '+' : ''}${formatMoney(value)}`;

export const RebalancePanel = ({
  accounts,
  symbolSummaries,
  symbolOrder,
  holdings,
  onQuantityDelta,
  onAddExisting,
  onAddNew,
  onReset,
  onSave,
  saveDisabled,
}: {
  accounts: StockAccount[];
  symbolSummaries: IStockPortfolioSymbolSummary[];
  symbolOrder: string[];
  holdings: StockRebalanceHolding[];
  onQuantityDelta: (holdingId: number, quantityDelta: number) => void;
  onAddExisting: (accountId: number, summary: IStockPortfolioSymbolSummary) => void;
  onAddNew: () => void;
  onReset: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
}) => {
  const visibleSummaries = useMemo(() => {
    const bySymbol = new Map(symbolSummaries.map((summary) => [summary.symbol, summary]));
    holdings.forEach((holding) => {
      if (bySymbol.has(holding.symbol)) return;
      bySymbol.set(holding.symbol, {
        symbol: holding.symbol,
        name: holding.name,
        sector: '其他',
        currentPrice: holding.currentPrice,
        quantity: 0,
        marketValue: 0,
        percent: 0,
        holdingCount: 0,
        accounts: [],
      });
    });
    return [...bySymbol.values()].sort((left, right) => {
      const leftIndex = symbolOrder.indexOf(left.symbol);
      const rightIndex = symbolOrder.indexOf(right.symbol);
      const resolvedLeftIndex = leftIndex === -1 ? symbolOrder.length : leftIndex;
      const resolvedRightIndex = rightIndex === -1 ? symbolOrder.length : rightIndex;
      return resolvedLeftIndex - resolvedRightIndex || left.symbol.localeCompare(right.symbol);
    });
  }, [holdings, symbolOrder, symbolSummaries]);

  return (
    <section className={styles.rebalancePanel}>
      <div className={styles.rebalanceTopline}>
        <div>
          <div className={styles.rebalanceTitle}>调仓编辑</div>
        </div>
        <div className={styles.rebalanceActions}>
          <button type="button" className={styles.rebalanceResetButton} onClick={onReset}>复原修改</button>
          <button type="button" className={styles.rebalanceSaveButton} disabled={saveDisabled} onClick={onSave}>保存调仓</button>
          <button type="button" className={styles.rebalanceAddButton} onClick={onAddNew}>新增股票</button>
        </div>
      </div>

      <div className={styles.rebalanceGrid} style={{ '--account-count': accounts.length } as CSSProperties}>
        <div className={styles.rebalanceGridHeader}>股票</div>
        {accounts.map((account) => (
          <div key={account.id} className={styles.rebalanceGridHeader}>{account.name}</div>
        ))}

        {visibleSummaries.map((summary) => (
          <RebalanceRow
            key={summary.symbol}
            accounts={accounts}
            summary={summary}
            holdings={holdings.filter((holding) => holding.symbol === summary.symbol)}
            onQuantityDelta={onQuantityDelta}
            onAddExisting={onAddExisting}
          />
        ))}
      </div>
    </section>
  );
};

const RebalanceRow = ({
  accounts,
  summary,
  holdings,
  onQuantityDelta,
  onAddExisting,
}: {
  accounts: StockAccount[];
  summary: IStockPortfolioSymbolSummary;
  holdings: StockRebalanceHolding[];
  onQuantityDelta: (holdingId: number, quantityDelta: number) => void;
  onAddExisting: (accountId: number, summary: IStockPortfolioSymbolSummary) => void;
}) => {
  const originalMarketValue = roundStockValue(
    holdings.reduce((sum, holding) => sum + holding.originalQuantity * holding.currentPrice, 0)
  );
  const marketValueDiff = roundStockValue(summary.marketValue - originalMarketValue);

  return (
    <>
      <div className={styles.rebalanceSymbolCell}>
        <span>{summary.name}</span>
        <em>{formatMoney(originalMarketValue)} <b>{formatSignedMoney(marketValueDiff)}</b></em>
        <em>{formatMoney(summary.marketValue)}</em>
      </div>
      {accounts.map((account) => {
      const holding = holdings.find((item) => item.accountId === account.id);
      return (
        <div key={account.id} className={styles.rebalanceQuantityCell}>
          {holding ? (
            <>
              <span className={styles.rebalanceQuantityValue}>{formatStockQuantity(holding.quantity)}</span>
              <div className={styles.rebalanceQuantityActions}>
                <button
                  type="button"
                  aria-label={`${account.name} ${summary.name} 减少 ${REBALANCE_QUANTITY_STEP} 股`}
                  disabled={holding.quantity <= 0}
                  onClick={() => onQuantityDelta(holding.id, -REBALANCE_QUANTITY_STEP)}
                >
                  -
                </button>
                <button
                  type="button"
                  aria-label={`${account.name} ${summary.name} 增加 ${REBALANCE_QUANTITY_STEP} 股`}
                  onClick={() => onQuantityDelta(holding.id, REBALANCE_QUANTITY_STEP)}
                >
                  +
                </button>
              </div>
            </>
          ) : (
            <>
              <span className={styles.rebalanceQuantityValue}>0</span>
              <div className={styles.rebalanceQuantityActions}>
                <button type="button" aria-label={`${account.name} ${summary.name} 减少 ${REBALANCE_QUANTITY_STEP} 股`} disabled>
                  -
                </button>
                <button
                  type="button"
                  aria-label={`${account.name} ${summary.name} 增加 ${REBALANCE_QUANTITY_STEP} 股`}
                  onClick={() => onAddExisting(account.id, summary)}
                >
                  +
                </button>
              </div>
            </>
          )}
        </div>
      );
      })}
    </>
  );
};