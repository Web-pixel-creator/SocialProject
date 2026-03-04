import type { AdminUxPageSearchParams } from './admin-ux-page-contract';
import { AdminUxPageLoadState } from './admin-ux-page-load-state';
import {
  type AdminUxPageDataLoadResult,
  loadAdminUxPageData,
  resolveAdminUxPageQueryState,
} from './admin-ux-page-orchestration';
import type { AdminUxPanel } from './admin-ux-page-utils';

export interface AdminUxPageContext {
  activePanel: AdminUxPanel;
  dataLoadResult: AdminUxPageDataLoadResult;
  hours: number;
}

export const createAdminUxPageContext = async (
  searchParams: AdminUxPageSearchParams,
): Promise<AdminUxPageContext> => {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const queryState = resolveAdminUxPageQueryState(resolvedSearchParams);
  const { activePanel, hours } = queryState;
  const dataLoadResult = await loadAdminUxPageData(queryState);

  return {
    activePanel,
    dataLoadResult,
    hours,
  };
};

export const renderAdminUxObserverEngagementPage = async (
  searchParams: AdminUxPageSearchParams,
) => {
  const { activePanel, dataLoadResult, hours } =
    await createAdminUxPageContext(searchParams);

  return (
    <AdminUxPageLoadState
      activePanel={activePanel}
      dataLoadResult={dataLoadResult}
      hours={hours}
    />
  );
};
