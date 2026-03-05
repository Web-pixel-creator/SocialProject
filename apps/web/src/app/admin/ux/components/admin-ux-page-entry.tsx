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
  AdminUxPanel,
} from './admin-ux-page-utils';

export interface AdminUxPageContext {
  activePanel: AdminUxPanel;
  allMetricsRiskFilter: AdminUxAllMetricsRiskFilter;
  allMetricsSignalFilter: AdminUxAllMetricsSignalFilter;
  allMetricsRiskTone: AdminUxAllMetricsRiskTone;
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
    allMetricsSignalFilter,
    allMetricsRiskTone,
    allMetricsView,
    expandAllGroups,
    hours,
  } = queryState;
  const dataLoadResult = await loadAdminUxPageData(queryState);

  return {
    activePanel,
    allMetricsRiskFilter,
    allMetricsSignalFilter,
    allMetricsRiskTone,
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
    allMetricsSignalFilter,
    allMetricsRiskTone,
    allMetricsView,
    dataLoadResult,
    expandAllGroups,
    hours,
  } = await createAdminUxPageContext(searchParams);

  return (
    <AdminUxPageLoadState
      activePanel={activePanel}
      allMetricsRiskFilter={allMetricsRiskFilter}
      allMetricsRiskTone={allMetricsRiskTone}
      allMetricsSignalFilter={allMetricsSignalFilter}
      allMetricsView={allMetricsView}
      dataLoadResult={dataLoadResult}
      expandAllGroups={expandAllGroups}
      hours={hours}
    />
  );
};
