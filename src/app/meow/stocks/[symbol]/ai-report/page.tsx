'use client';

import { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStockAiReports } from '@utils/stock';
import { AiReportDetailView } from '../../../ai-reports/report-detail-view';

const StockLatestAiReportPage = observer(function StockLatestAiReportPage({ params }: { params: { symbol: string } }) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const { reports, loading } = useStockAiReports(0, symbol);
  const latestReport = useMemo(() => reports[0] ?? null, [reports]);

  return <AiReportDetailView report={latestReport} loading={loading} emptyDescription="暂无该股票研报" />;
});

export default StockLatestAiReportPage;