import { AdminUxPageLoadState } from './admin-ux-page-load-state';
import {
  loadAdminUxPageData,
  resolveAdminUxPageQueryState,
} from './admin-ux-page-orchestration';

export type AdminUxPageSearchParams =
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;

export const renderAdminUxObserverEngagementPage = async (
  searchParams: AdminUxPageSearchParams,
) => {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const queryState = resolveAdminUxPageQueryState(resolvedSearchParams);
  const { activePanel, hours } = queryState;
  const dataLoadResult = await loadAdminUxPageData(queryState);

  return (
    <AdminUxPageLoadState
      activePanel={activePanel}
      dataLoadResult={dataLoadResult}
      hours={hours}
    />
  );
};
