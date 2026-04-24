// Central design tokens for Meow. Used by both React components and the
// ECharts color palette. CSS variables declared in globals.css mirror some
// of these values so native HTML/antd-mobile elements can use them too.

export const PALETTE = {
  // Brand
  primary: '#5B7CFA',
  primaryDim: '#3B5BE0',
  success: '#25B67A',
  warning: '#F5A524',
  danger: '#F04438',

  // Surfaces (light)
  bg: '#F4F6FB',
  surface: '#FFFFFF',
  surfaceAlt: '#F8F9FC',
  border: '#E5E8F0',

  // Text
  text: '#1F2330',
  textSub: '#5B6478',
  textMuted: '#8A93A8',
} as const;

// Ordered palette used for ECharts and analytic fallbacks.
export const CHART_COLORS = [
  '#5B7CFA', '#F5A524', '#25B67A', '#F04438', '#9B6DFF',
  '#14B8A6', '#FF7A59', '#64748B', '#D946EF', '#0EA5E9',
  '#EC4899', '#84CC16', '#F59E0B', '#6366F1', '#10B981',
];

// Stable color per top-level category NAME. Unknown names fall back to
// hashing so color is still deterministic across renders.
const TOP_CATEGORY_COLOR: Record<string, string> = {
  '餐饮美食': '#F97316',
  '休闲玩乐': '#8B5CF6',
  '休闲/玩乐/运动': '#8B5CF6',
  '看病买药': '#EF4444',
  '教育培训': '#0EA5E9',
  '酒店旅游': '#14B8A6',
  '日用百货': '#6366F1',
  '缴费/日用/百货': '#6366F1',
  '交通出行': '#22C55E',
  '社交':     '#EC4899',
  '居家缴费': '#F59E0B',
  '运动健身': '#10B981',
};

export const getCategoryColorByName = (name?: string | null): string => {
  if (!name) return PALETTE.textMuted;
  const direct = TOP_CATEGORY_COLOR[name];
  if (direct) return direct;
  // Deterministic fallback.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CHART_COLORS[Math.abs(hash) % CHART_COLORS.length];
};

// Format a number as CNY without trailing .00 clutter.
export const formatMoney = (n: number, opts?: { withSign?: boolean }) => {
  const sign = opts?.withSign && n > 0 ? '+' : '';
  const abs = Math.abs(n);
  const str =
    abs >= 10000
      ? (abs / 10000).toFixed(abs >= 100000 ? 1 : 2).replace(/\.?0+$/, '') + 'w'
      : abs.toFixed(2).replace(/\.?0+$/, '');
  return `${n < 0 ? '-' : sign}¥${str}`;
};
