'use client';

import { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStockAiReports } from '@utils/stock';
import { AiReportDetailView } from '../report-detail-view';

const AiReportDetailPage = observer(function AiReportDetailPage({ params }: { params: { id: string } }) {
  const { reports, loading } = useStockAiReports();
  const report = useMemo(() => reports.find((item) => String(item.id) === params.id) ?? null, [params.id, reports]);

  return <AiReportDetailView report={report} loading={loading} />;
});

export default AiReportDetailPage;