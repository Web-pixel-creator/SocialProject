import { AdminUxPageLoadState } from './components/admin-ux-page-load-state';
import {
  loadAdminUxPageData,
  resolveAdminUxPageQueryState,
} from './components/admin-ux-page-orchestration';

export default async function AdminUxObserverEngagementPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
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
}
