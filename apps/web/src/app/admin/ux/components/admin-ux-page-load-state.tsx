import { AdminUxPageContent } from './admin-ux-page-content';
import type { AdminUxPageDataLoadResult } from './admin-ux-page-orchestration';
import { AdminUxPageErrorState } from './admin-ux-page-shell-render';
import type {
  AdminUxAllMetricsRiskFilter,
  AdminUxAllMetricsRiskTone,
  AdminUxAllMetricsSignalFilter,
  AdminUxAllMetricsView,
  AdminUxObservabilityScope,
  AdminUxPanel,
} from './admin-ux-page-utils';

export const AdminUxPageLoadState = ({
  activePanel,
  allMetricsRiskFilter,
  allMetricsSignalFilter,
  allMetricsRiskTone,
  allMetricsView,
  correlationId,
  dataLoadResult,
  expandAllGroups,
  executionSessionId,
  hours,
  releaseRunId,
  routeKey,
}: {
  activePanel: AdminUxPanel;
  allMetricsRiskFilter: AdminUxAllMetricsRiskFilter;
  allMetricsSignalFilter: AdminUxAllMetricsSignalFilter;
  allMetricsRiskTone: AdminUxAllMetricsRiskTone;
  allMetricsView: AdminUxAllMetricsView;
  correlationId: AdminUxObservabilityScope['correlationId'];
  dataLoadResult: AdminUxPageDataLoadResult;
  expandAllGroups: boolean;
  executionSessionId: AdminUxObservabilityScope['executionSessionId'];
  hours: number;
  releaseRunId: AdminUxObservabilityScope['releaseRunId'];
  routeKey: AdminUxObservabilityScope['routeKey'];
}) => {
  if (dataLoadResult.error || dataLoadResult.mainPanelsProps === null) {
    return (
      <AdminUxPageErrorState
        message={dataLoadResult.error ?? 'Unable to load admin UX metrics.'}
      />
    );
  }

  return (
    <AdminUxPageContent
      activePanel={activePanel}
      allMetricsRiskFilter={allMetricsRiskFilter}
      allMetricsRiskTone={allMetricsRiskTone}
      allMetricsSignalFilter={allMetricsSignalFilter}
      allMetricsView={allMetricsView}
      correlationId={correlationId}
      executionSessionId={executionSessionId}
      expandAllGroups={expandAllGroups}
      hours={hours}
      kpis={dataLoadResult.kpis}
      mainPanelsProps={dataLoadResult.mainPanelsProps}
      releaseRunId={releaseRunId}
      routeKey={routeKey}
      windowHours={dataLoadResult.observerData?.windowHours}
    />
  );
};
