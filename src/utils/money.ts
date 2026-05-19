export const toMoneyCents = (value: number | string | null | undefined) => {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.round(numericValue * 100);
};

export const roundMoney = (value: number | string | null | undefined) => {
  return Number((toMoneyCents(value) / 100).toFixed(2));
};

export const isMoneyGreater = (
  left: number | string | null | undefined,
  right: number | string | null | undefined
) => toMoneyCents(left) > toMoneyCents(right);