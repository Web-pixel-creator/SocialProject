import type { AdminUxPageSearchParams } from './admin-ux-page-contract';
import { AdminUxPageLoadState } from './admin-ux-page-load-state';
import {
  type AdminUxPageDataLoadResult,
  loadAdminUxPageData,
  resolveAdminUxPageQueryState,
} from './admin-ux-page-orchestration';
import type {
  AdminUxAllMetricsRiskFilter,
  AdminUxAllMetricsRiskTone,
  AdminUxAllMetricsSignalFilter,
  AdminUxAllMetricsView,
  AdminUxObservabilityScope,
  AdminUxPanel,
} from './admin-ux-page-utils';

export interface AdminUxPageContext {
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
}

export const createAdminUxPageContext = async (
  searchParams: AdminUxPageSearchParams,
): Promise<AdminUxPageContext> => {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const queryState = resolveAdminUxPageQueryState(resolvedSearchParams);
  const {
    activePanel,
    allMetricsRiskFilter,
    allMetricsSignalFilter,
    allMetricsRiskTone,
    allMetricsView,
    correlationId,
    expandAllGroups,
    executionSessionId,
    hours,
    releaseRunId,
    routeKey,
  } = queryState;
  const dataLoadResult = await loadAdminUxPageData(queryState);

  return {
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
  };
};

export const renderAdminUxObserverEngagementPage = async (
  searchParams: AdminUxPageSearchParams,
) => {
  const {
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
  } = await createAdminUxPageContext(searchParams);

  return (
    <AdminUxPageLoadState
      activePanel={activePanel}
      allMetricsRiskFilter={allMetricsRiskFilter}
      allMetricsRiskTone={allMetricsRiskTone}
      allMetricsSignalFilter={allMetricsSignalFilter}
      allMetricsView={allMetricsView}
      correlationId={correlationId}
      dataLoadResult={dataLoadResult}
      executionSessionId={executionSessionId}
      expandAllGroups={expandAllGroups}
      hours={hours}
      releaseRunId={releaseRunId}
      routeKey={routeKey}
    />
  );
};
