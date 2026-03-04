import { AdminUxPageContent } from './components/admin-ux-page-content';
import {
  loadAdminUxPageData,
  resolveAdminUxPageQueryState,
} from './components/admin-ux-page-orchestration';
import { AdminUxPageErrorState } from './components/admin-ux-page-shell-render';

export default async function AdminUxObserverEngagementPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const queryState = resolveAdminUxPageQueryState(resolvedSearchParams);
  const { activePanel, hours } = queryState;
  const dataLoadResult = await loadAdminUxPageData(queryState);

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
      hours={hours}
      kpis={dataLoadResult.kpis}
      mainPanelsProps={dataLoadResult.mainPanelsProps}
      windowHours={dataLoadResult.observerData?.windowHours}
    />
  );
}
