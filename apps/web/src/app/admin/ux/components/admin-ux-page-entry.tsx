import type { AdminUxPageSearchParams } from './admin-ux-page-contract';
import { AdminUxPageLoadState } from './admin-ux-page-load-state';
import {
  type AdminUxPageDataLoadResult,
  loadAdminUxPageData,
  resolveAdminUxPageQueryState,
} from './admin-ux-page-orchestration';
import type {
  AdminUxAllMetricsRiskFilter,
  AdminUxAllMetricsView,
  AdminUxPanel,
} from './admin-ux-page-utils';

export interface AdminUxPageContext {
  activePanel: AdminUxPanel;
  allMetricsRiskFilter: AdminUxAllMetricsRiskFilter;
  allMetricsView: AdminUxAllMetricsView;
  dataLoadResult: AdminUxPageDataLoadResult;
  expandAllGroups: boolean;
  hours: number;
}

export const createAdminUxPageContext = async (
  searchParams: AdminUxPageSearchParams,
): Promise<AdminUxPageContext> => {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const queryState = resolveAdminUxPageQueryState(resolvedSearchParams);
  const {
    activePanel,
    allMetricsRiskFilter,
    allMetricsView,
    expandAllGroups,
    hours,
  } = queryState;
  const dataLoadResult = await loadAdminUxPageData(queryState);

  return {
    activePanel,
    allMetricsRiskFilter,
    allMetricsView,
    dataLoadResult,
    expandAllGroups,
    hours,
  };
};

export const renderAdminUxObserverEngagementPage = async (
  searchParams: AdminUxPageSearchParams,
) => {
  const {
    activePanel,
    allMetricsRiskFilter,
    allMetricsView,
    dataLoadResult,
    expandAllGroups,
    hours,
  } = await createAdminUxPageContext(searchParams);

  return (
    <AdminUxPageLoadState
      activePanel={activePanel}
      allMetricsRiskFilter={allMetricsRiskFilter}
      allMetricsView={allMetricsView}
      dataLoadResult={dataLoadResult}
      expandAllGroups={expandAllGroups}
      hours={hours}
    />
  );
};
