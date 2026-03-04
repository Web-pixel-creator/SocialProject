import { AdminUxMainPanels } from './components/admin-ux-main-panels';
import {
  loadAdminUxPageData,
  resolveAdminUxPageQueryState,
} from './components/admin-ux-page-orchestration';
import {
  AdminUxPageErrorState,
  AdminUxPageHeader,
  AdminUxPageLayout,
} from './components/admin-ux-page-shell-render';
import {
  buildAdminUxPanelChromeView,
  resolveAdminUxWindowHours,
} from './components/admin-ux-page-shell-view-model';
import { AdminUxPanelChrome } from './components/admin-ux-panel-chrome';

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

  const { mainPanelsProps, observerData } = dataLoadResult;
  const panelChromeView = buildAdminUxPanelChromeView({
    activePanel,
    hours,
    kpis: dataLoadResult.kpis,
  });

  return (
    <AdminUxPageLayout>
      <AdminUxPageHeader
        windowHours={resolveAdminUxWindowHours({
          windowHours: observerData?.windowHours,
          fallbackHours: hours,
        })}
      />

      <AdminUxPanelChrome
        activePanel={activePanel}
        panelTabs={panelChromeView.panelTabs}
        stickyKpis={panelChromeView.stickyKpis}
      />
      <AdminUxMainPanels activePanel={activePanel} {...mainPanelsProps} />
    </AdminUxPageLayout>
  );
}
